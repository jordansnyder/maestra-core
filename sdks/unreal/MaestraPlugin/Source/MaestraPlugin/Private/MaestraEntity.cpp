// Copyright Maestra Team. All Rights Reserved.

#include "MaestraEntity.h"
#include "MaestraClient.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"

UMaestraEntity::UMaestraEntity()
    : Client(nullptr)
{
    StateObject = MakeShared<FJsonObject>();
}

void UMaestraEntity::InitializeFromJson(TSharedPtr<FJsonObject> JsonObject, UMaestraClient* InClient)
{
    Client = InClient;

    Id = JsonObject->GetStringField(TEXT("id"));
    Name = JsonObject->GetStringField(TEXT("name"));
    Slug = JsonObject->GetStringField(TEXT("slug"));
    EntityType = JsonObject->GetStringField(TEXT("entity_type"));
    ParentId = JsonObject->GetStringField(TEXT("parent_id"));
    Status = JsonObject->GetStringField(TEXT("status"));

    const TSharedPtr<FJsonObject>* StateObj;
    if (JsonObject->TryGetObjectField(TEXT("state"), StateObj))
    {
        StateObject = *StateObj;
    }
}

void UMaestraEntity::UpdateStateFromJson(TSharedPtr<FJsonObject> StateJson)
{
    if (StateJson.IsValid())
    {
        StateObject = StateJson;
    }
}

FString UMaestraEntity::GetStateString(const FString& Key, const FString& DefaultValue)
{
    FString Value;
    if (StateObject.IsValid() && StateObject->TryGetStringField(Key, Value))
    {
        return Value;
    }
    return DefaultValue;
}

int32 UMaestraEntity::GetStateInt(const FString& Key, int32 DefaultValue)
{
    int32 Value;
    if (StateObject.IsValid() && StateObject->TryGetNumberField(Key, Value))
    {
        return Value;
    }
    return DefaultValue;
}

float UMaestraEntity::GetStateFloat(const FString& Key, float DefaultValue)
{
    double Value;
    if (StateObject.IsValid() && StateObject->TryGetNumberField(Key, Value))
    {
        return static_cast<float>(Value);
    }
    return DefaultValue;
}

bool UMaestraEntity::GetStateBool(const FString& Key, bool DefaultValue)
{
    bool Value;
    if (StateObject.IsValid() && StateObject->TryGetBoolField(Key, Value))
    {
        return Value;
    }
    return DefaultValue;
}

bool UMaestraEntity::HasStateKey(const FString& Key)
{
    return StateObject.IsValid() && StateObject->HasField(Key);
}

TArray<FString> UMaestraEntity::GetStateKeys()
{
    TArray<FString> Keys;
    if (StateObject.IsValid())
    {
        StateObject->Values.GetKeys(Keys);
    }
    return Keys;
}

FString UMaestraEntity::GetStateAsJson()
{
    if (!StateObject.IsValid())
    {
        return TEXT("{}");
    }

    FString OutputString;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutputString);
    FJsonSerializer::Serialize(StateObject.ToSharedRef(), Writer);
    return OutputString;
}

void UMaestraEntity::UpdateState(const FString& StateJson)
{
    if (Client)
    {
        Client->UpdateEntityState(Id, StateJson);
    }
}

void UMaestraEntity::SetState(const FString& StateJson)
{
    if (Client)
    {
        Client->SetEntityState(Id, StateJson);
    }
}

void UMaestraEntity::SetStateValue(const FString& Key, const FString& Value)
{
    FString Json = FString::Printf(TEXT("{\"%s\":\"%s\"}"), *Key, *Value);
    UpdateState(Json);
}

void UMaestraEntity::SetStateInt(const FString& Key, int32 Value)
{
    FString Json = FString::Printf(TEXT("{\"%s\":%d}"), *Key, Value);
    UpdateState(Json);
}

void UMaestraEntity::SetStateFloat(const FString& Key, float Value)
{
    FString Json = FString::Printf(TEXT("{\"%s\":%f}"), *Key, Value);
    UpdateState(Json);
}

void UMaestraEntity::SetStateBool(const FString& Key, bool Value)
{
    FString Json = FString::Printf(TEXT("{\"%s\":%s}"), *Key, Value ? TEXT("true") : TEXT("false"));
    UpdateState(Json);
}
