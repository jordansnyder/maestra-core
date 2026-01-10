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

protected:
    UPROPERTY()
    FString ApiBaseUrl;

    UPROPERTY()
    TMap<FString, UMaestraEntity*> EntityCache;

private:
    void HandleGetEntityResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString Slug);
    void HandleGetEntitiesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess);
    void HandleStateUpdateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString EntityId);

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> CreateRequest(const FString& Endpoint, const FString& Verb);
};
