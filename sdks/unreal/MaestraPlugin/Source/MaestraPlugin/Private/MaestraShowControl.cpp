// Copyright Maestra Team. All Rights Reserved.

#include "MaestraShowControl.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"

UMaestraShowControl::UMaestraShowControl()
    : ApiBaseUrl(TEXT("http://localhost:8080"))
    , CurrentPhase(EMaestraShowPhase::Unknown)
{
}

void UMaestraShowControl::Initialize(const FString& ApiUrl)
{
    ApiBaseUrl = ApiUrl;
    UE_LOG(LogTemp, Log, TEXT("[Maestra] ShowControl initialized with URL: %s"), *ApiBaseUrl);
}

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> UMaestraShowControl::CreateRequest(const FString& Endpoint, const FString& Verb)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(ApiBaseUrl + Endpoint);
    Request->SetVerb(Verb);
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    return Request;
}

// ===== Show State =====

void UMaestraShowControl::GetShowState()
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(TEXT("/show/state"), TEXT("GET"));
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraShowControl::HandleGetShowStateResponse);
    Request->ProcessRequest();
}

void UMaestraShowControl::HandleGetShowStateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnShowError.Broadcast(TEXT("Failed to get show state"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnShowError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnShowError.Broadcast(TEXT("Failed to parse show state JSON"));
        return;
    }

    FMaestraShowState State = ParseShowStateJson(JsonObject);
    ProcessShowState(State);
    OnShowStateReceived.Broadcast(State);
}

EMaestraShowPhase UMaestraShowControl::GetCurrentPhase() const
{
    return CurrentPhase;
}

// ===== Show Commands =====

void UMaestraShowControl::Warmup()
{
    SendShowCommand(TEXT("/show/warmup"));
}

void UMaestraShowControl::Go()
{
    SendShowCommand(TEXT("/show/go"));
}

void UMaestraShowControl::Pause()
{
    SendShowCommand(TEXT("/show/pause"));
}

void UMaestraShowControl::Resume()
{
    SendShowCommand(TEXT("/show/resume"));
}

void UMaestraShowControl::Stop()
{
    SendShowCommand(TEXT("/show/stop"));
}

void UMaestraShowControl::Shutdown()
{
    SendShowCommand(TEXT("/show/shutdown"));
}

void UMaestraShowControl::Reset()
{
    SendShowCommand(TEXT("/show/reset"));
}

void UMaestraShowControl::Transition(const FString& ToPhase, const FString& Source)
{
    SendTransitionCommand(ToPhase, Source);
}

// ===== Internal =====

void UMaestraShowControl::SendShowCommand(const FString& Endpoint)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(Endpoint, TEXT("POST"));
    Request->SetContentAsString(TEXT("{}"));

    // Extract command name for error reporting
    FString CommandName = Endpoint;
    CommandName.RemoveFromStart(TEXT("/show/"));

    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraShowControl::HandleShowCommandResponse, CommandName);
    Request->ProcessRequest();
}

void UMaestraShowControl::HandleShowCommandResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString CommandName)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnShowError.Broadcast(FString::Printf(TEXT("Show command failed (%s)"), *CommandName));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnShowError.Broadcast(FString::Printf(TEXT("HTTP Error %d (%s): %s"),
            Response->GetResponseCode(), *CommandName, *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnShowError.Broadcast(FString::Printf(TEXT("Failed to parse %s response"), *CommandName));
        return;
    }

    FMaestraShowState State = ParseShowStateJson(JsonObject);
    ProcessShowState(State);
    OnShowStateReceived.Broadcast(State);
}

void UMaestraShowControl::SendTransitionCommand(const FString& ToPhase, const FString& Source)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(TEXT("/show/transition"), TEXT("POST"));

    TSharedRef<FJsonObject> JsonObj = MakeShared<FJsonObject>();
    JsonObj->SetStringField(TEXT("to"), ToPhase);
    JsonObj->SetStringField(TEXT("source"), Source);

    FString Body;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(JsonObj, Writer);

    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraShowControl::HandleTransitionResponse);
    Request->ProcessRequest();
}

void UMaestraShowControl::HandleTransitionResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnShowError.Broadcast(TEXT("Show transition failed"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnShowError.Broadcast(FString::Printf(TEXT("HTTP Error %d (transition): %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnShowError.Broadcast(TEXT("Failed to parse transition response"));
        return;
    }

    FMaestraShowState State = ParseShowStateJson(JsonObject);
    ProcessShowState(State);
    OnShowStateReceived.Broadcast(State);
}

// ===== Helpers =====

void UMaestraShowControl::ProcessShowState(const FMaestraShowState& State)
{
    EMaestraShowPhase NewPhase = ParsePhase(State.Phase);

    if (NewPhase != CurrentPhase)
    {
        EMaestraShowPhase PreviousPhase = CurrentPhase;
        CurrentPhase = NewPhase;
        UE_LOG(LogTemp, Log, TEXT("[Maestra] Show phase changed: %s -> %s"), *State.PreviousPhase, *State.Phase);
        OnShowPhaseChanged.Broadcast(CurrentPhase, PreviousPhase);
    }
}

FMaestraShowState UMaestraShowControl::ParseShowStateJson(TSharedPtr<FJsonObject> JsonObject)
{
    FMaestraShowState State;
    if (!JsonObject.IsValid()) return State;

    if (JsonObject->HasField(TEXT("phase")))
    {
        State.Phase = JsonObject->GetStringField(TEXT("phase"));
    }
    if (JsonObject->HasField(TEXT("previous_phase")))
    {
        State.PreviousPhase = JsonObject->GetStringField(TEXT("previous_phase"));
    }
    if (JsonObject->HasField(TEXT("transition_time")))
    {
        State.TransitionTime = JsonObject->GetStringField(TEXT("transition_time"));
    }
    if (JsonObject->HasField(TEXT("source")))
    {
        State.Source = JsonObject->GetStringField(TEXT("source"));
    }

    return State;
}

EMaestraShowPhase UMaestraShowControl::ParsePhase(const FString& PhaseString)
{
    if (PhaseString.Equals(TEXT("idle"), ESearchCase::IgnoreCase))
    {
        return EMaestraShowPhase::Idle;
    }
    if (PhaseString.Equals(TEXT("pre_show"), ESearchCase::IgnoreCase))
    {
        return EMaestraShowPhase::PreShow;
    }
    if (PhaseString.Equals(TEXT("active"), ESearchCase::IgnoreCase))
    {
        return EMaestraShowPhase::Active;
    }
    if (PhaseString.Equals(TEXT("paused"), ESearchCase::IgnoreCase))
    {
        return EMaestraShowPhase::Paused;
    }
    if (PhaseString.Equals(TEXT("post_show"), ESearchCase::IgnoreCase))
    {
        return EMaestraShowPhase::PostShow;
    }
    if (PhaseString.Equals(TEXT("shutdown"), ESearchCase::IgnoreCase))
    {
        return EMaestraShowPhase::Shutdown;
    }

    return EMaestraShowPhase::Unknown;
}
