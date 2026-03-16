// Copyright Maestra Team. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "Interfaces/IHttpRequest.h"
#include "MaestraDiscovery.generated.h"

/**
 * Provisioning configuration received after device approval
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraProvisionConfig
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString DeviceId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString EntityId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString ProvisionStatus;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString ApiUrl;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString NatsUrl;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString MqttBroker;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    int32 MqttPort = 1883;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    FString WsUrl;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Discovery")
    TMap<FString, FString> EnvVars;
};

// Delegate declarations
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDeviceRegistered, const FString&, DeviceId);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnProvisionReceived, const FMaestraProvisionConfig&, Config);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnDiscoveryError, const FString&, ErrorMessage);

/**
 * Handles device discovery and provisioning with the Maestra platform.
 * Advertises the device, then polls for provisioning config after admin approval.
 */
UCLASS(BlueprintType, Blueprintable)
class MAESTRAPLUGIN_API UMaestraDiscovery : public UObject
{
    GENERATED_BODY()

public:
    UMaestraDiscovery();

    /**
     * Advertise this device to the Maestra Fleet Manager for discovery.
     * POSTs to /devices/discover and fires OnDeviceRegistered on success.
     * @param ApiUrl The base URL for the Fleet Manager API
     * @param HardwareId Unique hardware identifier for this device
     * @param DeviceType Device type string (e.g. "unreal", "touchdesigner")
     * @param Name Human-readable name for the device
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Discovery")
    void AdvertiseDevice(const FString& ApiUrl, const FString& HardwareId, const FString& DeviceType, const FString& Name);

    /**
     * Poll the provisioning endpoint until the device is approved.
     * Fires OnProvisionReceived when provisioning config is available,
     * or OnDiscoveryError on timeout or failure.
     * @param ApiUrl The base URL for the Fleet Manager API
     * @param DeviceId The device UUID returned from AdvertiseDevice
     * @param PollInterval Seconds between poll requests (default 5)
     * @param Timeout Maximum seconds to wait before giving up (default 300)
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Discovery")
    void WaitForProvisioning(const FString& ApiUrl, const FString& DeviceId, float PollInterval = 5.0f, float Timeout = 300.0f);

    /**
     * Stop polling for provisioning (cancels any active WaitForProvisioning)
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Discovery")
    void StopPolling();

    // Events
    UPROPERTY(BlueprintAssignable, Category = "Maestra|Discovery")
    FOnDeviceRegistered OnDeviceRegistered;

    UPROPERTY(BlueprintAssignable, Category = "Maestra|Discovery")
    FOnProvisionReceived OnProvisionReceived;

    UPROPERTY(BlueprintAssignable, Category = "Maestra|Discovery")
    FOnDiscoveryError OnDiscoveryError;

protected:
    /** Cached API URL for polling */
    FString CachedApiUrl;

    /** Cached device ID for polling */
    FString CachedDeviceId;

    /** Poll interval in seconds */
    float CachedPollInterval;

    /** Time when polling started */
    double PollStartTime;

    /** Maximum poll duration in seconds */
    float CachedTimeout;

    /** Whether we are actively polling */
    bool bIsPolling;

    /** Timer handle for polling */
    FTimerHandle PollTimerHandle;

private:
    void HandleAdvertiseResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleProvisionPollResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void PollProvisionEndpoint();

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> CreateRequest(const FString& Url, const FString& Verb);
};
