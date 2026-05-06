// Copyright Maestra Team. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "Interfaces/IHttpRequest.h"
#include "MaestraShowControl.generated.h"

/**
 * Show phase enum matching Maestra show control phases
 */
UENUM(BlueprintType)
enum class EMaestraShowPhase : uint8
{
    Idle        UMETA(DisplayName = "Idle"),
    PreShow     UMETA(DisplayName = "Pre-Show"),
    Active      UMETA(DisplayName = "Active"),
    Paused      UMETA(DisplayName = "Paused"),
    PostShow    UMETA(DisplayName = "Post-Show"),
    Shutdown    UMETA(DisplayName = "Shutdown"),
    Unknown     UMETA(DisplayName = "Unknown")
};

/**
 * Show state data from the API
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraShowState
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|ShowControl")
    FString Phase;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|ShowControl")
    FString PreviousPhase;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|ShowControl")
    FString TransitionTime;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|ShowControl")
    FString Source;
};

// Delegate declarations
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShowStateReceived, const FMaestraShowState&, State);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnShowPhaseChanged, EMaestraShowPhase, NewPhase, EMaestraShowPhase, PreviousPhase);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnShowError, const FString&, ErrorMessage);

/**
 * Manages show control state and transitions for the Maestra platform.
 * Provides Blueprint-exposed methods for all show lifecycle commands.
 */
UCLASS(BlueprintType, Blueprintable)
class MAESTRAPLUGIN_API UMaestraShowControl : public UObject
{
    GENERATED_BODY()

public:
    UMaestraShowControl();

    /**
     * Initialize the show control with API URL
     * @param ApiUrl The base URL for the Maestra Fleet Manager API
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Initialize(const FString& ApiUrl);

    // ===== Show State =====

    /**
     * Get the current show state from the API
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void GetShowState();

    /**
     * Get the current show phase (last known)
     */
    UFUNCTION(BlueprintPure, Category = "Maestra|ShowControl")
    EMaestraShowPhase GetCurrentPhase() const;

    // ===== Show Commands =====

    /**
     * Transition to warmup / pre-show phase
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Warmup();

    /**
     * Start the show (transition to active phase)
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Go();

    /**
     * Pause the show
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Pause();

    /**
     * Resume the show from paused state
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Resume();

    /**
     * Stop the show (transition to post-show phase)
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Stop();

    /**
     * Shutdown the show
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Shutdown();

    /**
     * Reset the show back to idle
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Reset();

    /**
     * Transition to an arbitrary phase
     * @param ToPhase Target phase name (idle, pre_show, active, paused, post_show, shutdown)
     * @param Source Optional source identifier
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|ShowControl")
    void Transition(const FString& ToPhase, const FString& Source = TEXT("unreal"));

    // ===== Events =====

    /** Fired when show state is received from the API */
    UPROPERTY(BlueprintAssignable, Category = "Maestra|ShowControl")
    FOnShowStateReceived OnShowStateReceived;

    /** Fired when the show phase changes */
    UPROPERTY(BlueprintAssignable, Category = "Maestra|ShowControl")
    FOnShowPhaseChanged OnShowPhaseChanged;

    /** Fired when a show control error occurs */
    UPROPERTY(BlueprintAssignable, Category = "Maestra|ShowControl")
    FOnShowError OnShowError;

    // ===== Helpers =====

    /**
     * Parse a phase string from the API into the EMaestraShowPhase enum
     */
    UFUNCTION(BlueprintPure, Category = "Maestra|ShowControl")
    static EMaestraShowPhase ParsePhase(const FString& PhaseString);

protected:
    UPROPERTY()
    FString ApiBaseUrl;

    UPROPERTY()
    EMaestraShowPhase CurrentPhase;

private:
    void SendShowCommand(const FString& Endpoint);
    void SendTransitionCommand(const FString& ToPhase, const FString& Source);

    void HandleGetShowStateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleShowCommandResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString CommandName);
    void HandleTransitionResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);

    void ProcessShowState(const FMaestraShowState& State);
    FMaestraShowState ParseShowStateJson(TSharedPtr<FJsonObject> JsonObject);

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> CreateRequest(const FString& Endpoint, const FString& Verb);
};
