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

// ===== Stream Types =====

/**
 * Stream type definition
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStreamTypeInfo
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Id;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Name;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString DisplayName;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Description;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Icon;
};

/**
 * Stream information from the registry
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStreamInfo
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Id;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Name;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamType;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString PublisherId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Protocol;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Address;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    int32 Port = 0;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString EntityId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    int32 ActiveSessions = 0;
};

/**
 * Parameters for advertising a stream
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStreamAdvertiseRequest
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString Name;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString StreamType;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString PublisherId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString Protocol;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString Address;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    int32 Port = 0;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString EntityId;

    /** Optional config as JSON string */
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString ConfigJson;
};

/**
 * Parameters for requesting to consume a stream
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStreamRequestBody
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString ConsumerId;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    FString ConsumerAddress;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Maestra|Streams")
    int32 ConsumerPort = 0;
};

/**
 * Publisher's response to a stream request
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStreamOffer
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString SessionId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamName;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamType;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Protocol;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString PublisherAddress;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    int32 PublisherPort = 0;
};

/**
 * Active streaming session
 */
USTRUCT(BlueprintType)
struct MAESTRAPLUGIN_API FMaestraStreamSession
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString SessionId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamName;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString StreamType;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString PublisherId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString ConsumerId;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Protocol;

    UPROPERTY(BlueprintReadOnly, Category = "Maestra|Streams")
    FString Status;
};

// Delegate declarations
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnStateChanged, const FMaestraStateChangeEvent&, Event);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnConnected, bool, bSuccess);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnError, const FString&, ErrorMessage);
