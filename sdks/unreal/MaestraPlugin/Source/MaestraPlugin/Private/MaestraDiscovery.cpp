// Copyright Maestra Team. All Rights Reserved.

#include "MaestraDiscovery.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "TimerManager.h"
#include "Engine/World.h"
#include "Engine/Engine.h"

UMaestraDiscovery::UMaestraDiscovery()
    : CachedPollInterval(5.0f)
    , PollStartTime(0.0)
    , CachedTimeout(300.0f)
    , bIsPolling(false)
{
}

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> UMaestraDiscovery::CreateRequest(const FString& Url, const FString& Verb)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(Url);
    Request->SetVerb(Verb);
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    return Request;
}

void UMaestraDiscovery::AdvertiseDevice(const FString& ApiUrl, const FString& HardwareId, const FString& DeviceType, const FString& Name)
{
    CachedApiUrl = ApiUrl;

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        ApiUrl + TEXT("/devices/discover"),
        TEXT("POST")
    );

    // Build JSON body
    TSharedRef<FJsonObject> JsonObj = MakeShared<FJsonObject>();
    JsonObj->SetStringField(TEXT("name"), Name);
    JsonObj->SetStringField(TEXT("device_type"), DeviceType);
    JsonObj->SetStringField(TEXT("hardware_id"), HardwareId);

    FString Body;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(JsonObj, Writer);

    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraDiscovery::HandleAdvertiseResponse);
    Request->ProcessRequest();

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Advertising device: %s (type: %s, hwid: %s)"), *Name, *DeviceType, *HardwareId);
}

void UMaestraDiscovery::HandleAdvertiseResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnDiscoveryError.Broadcast(TEXT("Failed to advertise device - no response"));
        return;
    }

    if (Response->GetResponseCode() == 403)
    {
        OnDiscoveryError.Broadcast(TEXT("Device hardware_id is blocked"));
        return;
    }

    if (Response->GetResponseCode() != 200 && Response->GetResponseCode() != 201)
    {
        OnDiscoveryError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnDiscoveryError.Broadcast(TEXT("Failed to parse discovery response JSON"));
        return;
    }

    FString DeviceId = JsonObject->GetStringField(TEXT("id"));
    CachedDeviceId = DeviceId;

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Device registered with id: %s"), *DeviceId);
    OnDeviceRegistered.Broadcast(DeviceId);
}

void UMaestraDiscovery::WaitForProvisioning(const FString& ApiUrl, const FString& DeviceId, float PollInterval, float Timeout)
{
    CachedApiUrl = ApiUrl;
    CachedDeviceId = DeviceId;
    CachedPollInterval = FMath::Max(PollInterval, 1.0f);
    CachedTimeout = Timeout;
    PollStartTime = FPlatformTime::Seconds();
    bIsPolling = true;

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Waiting for provisioning of device %s (poll every %.1fs, timeout %.0fs)"),
        *DeviceId, CachedPollInterval, CachedTimeout);

    // Start the first poll immediately
    PollProvisionEndpoint();
}

void UMaestraDiscovery::PollProvisionEndpoint()
{
    if (!bIsPolling)
    {
        return;
    }

    // Check timeout
    double ElapsedTime = FPlatformTime::Seconds() - PollStartTime;
    if (ElapsedTime >= CachedTimeout)
    {
        bIsPolling = false;
        OnDiscoveryError.Broadcast(FString::Printf(TEXT("Provisioning timed out after %.0f seconds"), CachedTimeout));
        return;
    }

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        CachedApiUrl + FString::Printf(TEXT("/devices/%s/provision"), *CachedDeviceId),
        TEXT("GET")
    );

    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraDiscovery::HandleProvisionPollResponse);
    Request->ProcessRequest();
}

void UMaestraDiscovery::HandleProvisionPollResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bIsPolling)
    {
        return;
    }

    if (!bSuccess || !Response.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Maestra] Provision poll failed - will retry"));
        // Schedule retry via async task on game thread
        if (GEngine && GEngine->GetWorldContexts().Num() > 0)
        {
            UWorld* World = GEngine->GetWorldContexts()[0].World();
            if (World)
            {
                World->GetTimerManager().SetTimer(
                    PollTimerHandle,
                    FTimerDelegate::CreateUObject(this, &UMaestraDiscovery::PollProvisionEndpoint),
                    CachedPollInterval,
                    false
                );
            }
        }
        return;
    }

    // 403 means device is pending - keep polling
    if (Response->GetResponseCode() == 403)
    {
        UE_LOG(LogTemp, Verbose, TEXT("[Maestra] Device still pending approval, polling again in %.1fs"), CachedPollInterval);
        if (GEngine && GEngine->GetWorldContexts().Num() > 0)
        {
            UWorld* World = GEngine->GetWorldContexts()[0].World();
            if (World)
            {
                World->GetTimerManager().SetTimer(
                    PollTimerHandle,
                    FTimerDelegate::CreateUObject(this, &UMaestraDiscovery::PollProvisionEndpoint),
                    CachedPollInterval,
                    false
                );
            }
        }
        return;
    }

    if (Response->GetResponseCode() == 404)
    {
        bIsPolling = false;
        OnDiscoveryError.Broadcast(TEXT("No provisioning record found for this device"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        bIsPolling = false;
        OnDiscoveryError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    // Parse provisioning config
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        bIsPolling = false;
        OnDiscoveryError.Broadcast(TEXT("Failed to parse provisioning JSON"));
        return;
    }

    FMaestraProvisionConfig Config;
    Config.DeviceId = JsonObject->GetStringField(TEXT("device_id"));
    Config.ProvisionStatus = JsonObject->GetStringField(TEXT("provision_status"));
    Config.ApiUrl = JsonObject->GetStringField(TEXT("api_url"));
    Config.NatsUrl = JsonObject->GetStringField(TEXT("nats_url"));
    Config.MqttBroker = JsonObject->GetStringField(TEXT("mqtt_broker"));
    Config.MqttPort = JsonObject->GetIntegerField(TEXT("mqtt_port"));

    if (JsonObject->HasField(TEXT("ws_url")) && !JsonObject->GetStringField(TEXT("ws_url")).IsEmpty())
    {
        Config.WsUrl = JsonObject->GetStringField(TEXT("ws_url"));
    }

    if (JsonObject->HasField(TEXT("entity_id")) && !JsonObject->IsNull(TEXT("entity_id")))
    {
        Config.EntityId = JsonObject->GetStringField(TEXT("entity_id"));
    }

    // Parse env_vars object into TMap
    const TSharedPtr<FJsonObject>* EnvVarsObj;
    if (JsonObject->TryGetObjectField(TEXT("env_vars"), EnvVarsObj) && EnvVarsObj->IsValid())
    {
        for (const auto& Pair : (*EnvVarsObj)->Values)
        {
            FString Value;
            if (Pair.Value->TryGetString(Value))
            {
                Config.EnvVars.Add(Pair.Key, Value);
            }
            else
            {
                // For non-string values, serialize to string
                Config.EnvVars.Add(Pair.Key, Pair.Value->AsString());
            }
        }
    }

    bIsPolling = false;

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Provisioning received for device %s (status: %s)"),
        *Config.DeviceId, *Config.ProvisionStatus);
    OnProvisionReceived.Broadcast(Config);
}

void UMaestraDiscovery::StopPolling()
{
    bIsPolling = false;

    // Clear the timer if active
    if (GEngine && GEngine->GetWorldContexts().Num() > 0)
    {
        UWorld* World = GEngine->GetWorldContexts()[0].World();
        if (World)
        {
            World->GetTimerManager().ClearTimer(PollTimerHandle);
        }
    }

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Provisioning polling stopped"));
}
