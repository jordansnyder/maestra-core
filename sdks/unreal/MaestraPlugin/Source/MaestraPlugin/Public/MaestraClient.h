// Copyright Maestra Team. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "MaestraTypes.h"
#include "Interfaces/IHttpRequest.h"
#include "MaestraClient.generated.h"

class UMaestraEntity;

/**
 * Main client for connecting to the Maestra platform.
 * Provides entity management and state synchronization.
 */
UCLASS(BlueprintType, Blueprintable)
class MAESTRAPLUGIN_API UMaestraClient : public UObject
{
    GENERATED_BODY()

public:
    UMaestraClient();

    /**
     * Initialize the client with API URL
     * @param ApiUrl The base URL for the Maestra Fleet Manager API
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra")
    void Initialize(const FString& ApiUrl);

    /**
     * Get an entity by slug
     * @param Slug The unique slug identifier
     * @param OnComplete Callback when entity is retrieved
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra")
    void GetEntityBySlug(const FString& Slug);

    /**
     * Get all entities, optionally filtered by type
     * @param EntityType Optional filter by entity type name
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra")
    void GetEntities(const FString& EntityType = TEXT(""));

    /**
     * Update entity state (merge with existing)
     * @param EntityId The entity UUID
     * @param StateJson JSON string of state updates
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra")
    void UpdateEntityState(const FString& EntityId, const FString& StateJson);

    /**
     * Replace entity state entirely
     * @param EntityId The entity UUID
     * @param StateJson JSON string of new state
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra")
    void SetEntityState(const FString& EntityId, const FString& StateJson);

    /**
     * Get cached entity by slug (returns nullptr if not loaded)
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra")
    UMaestraEntity* GetCachedEntity(const FString& Slug);

    // Events
    UPROPERTY(BlueprintAssignable, Category = "Maestra")
    FOnConnected OnConnected;

    UPROPERTY(BlueprintAssignable, Category = "Maestra")
    FOnError OnError;

    // Called when entity is retrieved
    DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnEntityReceived, const FString&, Slug, UMaestraEntity*, Entity);
    UPROPERTY(BlueprintAssignable, Category = "Maestra")
    FOnEntityReceived OnEntityReceived;

    // Called when entities list is received
    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnEntitiesReceived, const TArray<FMaestraEntityData>&, Entities);
    UPROPERTY(BlueprintAssignable, Category = "Maestra")
    FOnEntitiesReceived OnEntitiesReceived;

    // ===== Stream Events =====

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStreamsReceived, const TArray<FMaestraStreamInfo>&, Streams);
    UPROPERTY(BlueprintAssignable, Category = "Maestra|Streams")
    FOnStreamsReceived OnStreamsReceived;

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStreamAdvertised, const FMaestraStreamInfo&, Stream);
    UPROPERTY(BlueprintAssignable, Category = "Maestra|Streams")
    FOnStreamAdvertised OnStreamAdvertised;

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStreamOfferReceived, const FMaestraStreamOffer&, Offer);
    UPROPERTY(BlueprintAssignable, Category = "Maestra|Streams")
    FOnStreamOfferReceived OnStreamOfferReceived;

    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSessionsReceived, const TArray<FMaestraStreamSession>&, Sessions);
    UPROPERTY(BlueprintAssignable, Category = "Maestra|Streams")
    FOnSessionsReceived OnSessionsReceived;

    // ===== Stream Methods =====

    /**
     * List active streams, optionally filtered by type
     * @param StreamType Optional stream type filter (ndi, audio, video, etc.)
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void GetStreams(const FString& StreamType = TEXT(""));

    /**
     * Get a specific stream by ID
     * @param StreamId The stream UUID
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void GetStream(const FString& StreamId);

    /**
     * Advertise a new stream
     * @param Request Stream advertisement parameters
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void AdvertiseStream(const FMaestraStreamAdvertiseRequest& Request);

    /**
     * Withdraw a stream from the registry
     * @param StreamId The stream UUID to withdraw
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void WithdrawStream(const FString& StreamId);

    /**
     * Send stream heartbeat to refresh TTL (call every ~10 seconds)
     * @param StreamId The stream UUID
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void StreamHeartbeat(const FString& StreamId);

    /**
     * Request to consume a stream (initiates NATS negotiation with publisher)
     * @param StreamId The stream UUID to consume
     * @param Request Consumer connection parameters
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void RequestStream(const FString& StreamId, const FMaestraStreamRequestBody& Request);

    /**
     * List active sessions, optionally filtered by stream
     * @param StreamId Optional stream ID filter
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void GetSessions(const FString& StreamId = TEXT(""));

    /**
     * Stop an active session
     * @param SessionId The session UUID to stop
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void StopSession(const FString& SessionId);

    /**
     * Send session heartbeat to refresh TTL (call every ~10 seconds)
     * @param SessionId The session UUID
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Streams")
    void SessionHeartbeat(const FString& SessionId);

protected:
    UPROPERTY()
    FString ApiBaseUrl;

    UPROPERTY()
    TMap<FString, UMaestraEntity*> EntityCache;

private:
    // Entity handlers
    void HandleGetEntityResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString Slug);
    void HandleGetEntitiesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleStateUpdateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString EntityId);

    // Stream handlers
    void HandleGetStreamsResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleGetStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleAdvertiseStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleWithdrawStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString StreamId);
    void HandleStreamHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleRequestStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleGetSessionsResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleStopSessionResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString SessionId);
    void HandleSessionHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);

    // Helpers
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> CreateRequest(const FString& Endpoint, const FString& Verb);
    FMaestraStreamInfo ParseStreamInfo(TSharedPtr<FJsonObject> JsonObj);
    FMaestraStreamSession ParseStreamSession(TSharedPtr<FJsonObject> JsonObj);
};
