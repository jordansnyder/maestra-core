// Copyright Maestra Team. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "MaestraTypes.h"
#include "MaestraEntity.generated.h"

class UMaestraClient;

/**
 * Represents an entity in the Maestra platform.
 * Provides access to entity metadata and state management.
 */
UCLASS(BlueprintType)
class MAESTRAPLUGIN_API UMaestraEntity : public UObject
{
    GENERATED_BODY()

public:
    UMaestraEntity();

    /** Initialize from JSON response */
    void InitializeFromJson(TSharedPtr<FJsonObject> JsonObject, UMaestraClient* InClient);

    /** Update state from JSON object */
    void UpdateStateFromJson(TSharedPtr<FJsonObject> StateJson);

    // Properties
    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Entity")
    FString Id;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Entity")
    FString Name;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Entity")
    FString Slug;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Entity")
    FString EntityType;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Entity")
    FString ParentId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Entity")
    FString Status;

    /**
     * Get state value as string
     * @param Key The state key
     * @param DefaultValue Value to return if key not found
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    FString GetStateString(const FString& Key, const FString& DefaultValue = TEXT(""));

    /**
     * Get state value as integer
     * @param Key The state key
     * @param DefaultValue Value to return if key not found
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    int32 GetStateInt(const FString& Key, int32 DefaultValue = 0);

    /**
     * Get state value as float
     * @param Key The state key
     * @param DefaultValue Value to return if key not found
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    float GetStateFloat(const FString& Key, float DefaultValue = 0.0f);

    /**
     * Get state value as boolean
     * @param Key The state key
     * @param DefaultValue Value to return if key not found
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    bool GetStateBool(const FString& Key, bool DefaultValue = false);

    /**
     * Check if state has a specific key
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    bool HasStateKey(const FString& Key);

    /**
     * Get all state keys
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    TArray<FString> GetStateKeys();

    /**
     * Get full state as JSON string
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    FString GetStateAsJson();

    /**
     * Update state with new values (merge)
     * @param StateJson JSON string of values to merge
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    void UpdateState(const FString& StateJson);

    /**
     * Replace entire state
     * @param StateJson JSON string of new state
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    void SetState(const FString& StateJson);

    /**
     * Update a single state value
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    void SetStateValue(const FString& Key, const FString& Value);

    /**
     * Update a single integer state value
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    void SetStateInt(const FString& Key, int32 Value);

    /**
     * Update a single float state value
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    void SetStateFloat(const FString& Key, float Value);

    /**
     * Update a single boolean state value
     */
    UFUNCTION(BlueprintCallable, Category = "Maestra|Entity")
    void SetStateBool(const FString& Key, bool Value);

    // Events
    UPROPERTY(BlueprintAssignable, Category = "Maestra|Entity")
    FOnStateChanged OnStateChanged;

protected:
    UPROPERTY()
    UMaestraClient* Client;

    TSharedPtr<FJsonObject> StateObject;
};
