// Copyright Maestra Team. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "MaestraTypes.generated.h"

/**
 * Entity type data
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraEntityType
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Id;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Name;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString DisplayName;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Icon;
};

/**
 * Entity data returned from API
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraEntityData
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Id;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Name;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Slug;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString EntityType;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString ParentId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Status;
};

/**
 * State change event data
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStateChangeEvent
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString EntityId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString EntitySlug;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString EntityType;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    TArray<FString> ChangedKeys;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FString Source;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra")
    FDateTime Timestamp;
};

// Delegate declarations
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStateChanged, const FMaestraStateChangeEvent&, Event);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConnected, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnError, const FString&, ErrorMessage);
