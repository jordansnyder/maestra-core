// Copyright Maestra Team. All Rights Reserved.

#include "MaestraClient.h"
#include "MaestraEntity.h"
#include "HttpModule.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"

UMaestraClient::UMaestraClient()
    : ApiBaseUrl(TEXT("http://localhost:8080"))
{
}

void UMaestraClient::Initialize(const FString& ApiUrl)
{
    ApiBaseUrl = ApiUrl;
    UE_LOG(LogTemp, Log, TEXT("Maestra Client initialized with URL: %s"), *ApiBaseUrl);
    OnConnected.Broadcast(true);
}

TSharedRef<IHttpRequest, ESPMode::ThreadSafe> UMaestraClient::CreateRequest(const FString& Endpoint, const FString& Verb)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->SetURL(ApiBaseUrl + Endpoint);
    Request->SetVerb(Verb);
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    return Request;
}

void UMaestraClient::GetEntityBySlug(const FString& Slug)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/entities/by-slug/%s"), *Slug),
        TEXT("GET")
    );

    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleGetEntityResponse, Slug);
    Request->ProcessRequest();
}

void UMaestraClient::HandleGetEntityResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString Slug)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to get entity"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to parse entity JSON"));
        return;
    }

    // Create or update entity in cache
    UMaestraEntity* Entity = EntityCache.FindRef(Slug);
    if (!Entity)
    {
        Entity = NewObject<UMaestraEntity>(this);
        EntityCache.Add(Slug, Entity);
    }

    Entity->InitializeFromJson(JsonObject, this);
    OnEntityReceived.Broadcast(Slug, Entity);
}

void UMaestraClient::GetEntities(const FString& EntityType)
{
    FString Endpoint = TEXT("/entities");
    if (!EntityType.IsEmpty())
    {
        Endpoint += FString::Printf(TEXT("?type=%s"), *EntityType);
    }

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(Endpoint, TEXT("GET"));
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleGetEntitiesResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleGetEntitiesResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to get entities"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d"), Response->GetResponseCode()));
        return;
    }

    TArray<TSharedPtr<FJsonValue>> JsonArray;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonArray))
    {
        OnError.Broadcast(TEXT("Failed to parse entities JSON"));
        return;
    }

    TArray<FMaestraEntityData> Entities;
    for (const TSharedPtr<FJsonValue>& JsonValue : JsonArray)
    {
        TSharedPtr<FJsonObject> JsonObj = JsonValue->AsObject();
        if (JsonObj.IsValid())
        {
            FMaestraEntityData EntityData;
            EntityData.Id = JsonObj->GetStringField(TEXT("id"));
            EntityData.Name = JsonObj->GetStringField(TEXT("name"));
            EntityData.Slug = JsonObj->GetStringField(TEXT("slug"));
            EntityData.EntityType = JsonObj->GetStringField(TEXT("entity_type"));
            EntityData.ParentId = JsonObj->GetStringField(TEXT("parent_id"));
            EntityData.Status = JsonObj->GetStringField(TEXT("status"));
            Entities.Add(EntityData);
        }
    }

    OnEntitiesReceived.Broadcast(Entities);
}

void UMaestraClient::UpdateEntityState(const FString& EntityId, const FString& StateJson)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/entities/%s/state"), *EntityId),
        TEXT("PATCH")
    );

    // Wrap state in request body
    FString Body = FString::Printf(TEXT("{\"state\":%s,\"source\":\"unreal\"}"), *StateJson);
    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleStateUpdateResponse, EntityId);
    Request->ProcessRequest();
}

void UMaestraClient::SetEntityState(const FString& EntityId, const FString& StateJson)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/entities/%s/state"), *EntityId),
        TEXT("PUT")
    );

    FString Body = FString::Printf(TEXT("{\"state\":%s,\"source\":\"unreal\"}"), *StateJson);
    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleStateUpdateResponse, EntityId);
    Request->ProcessRequest();
}

void UMaestraClient::HandleStateUpdateResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString EntityId)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to update state"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    // Parse response and update cached entity if exists
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
    {
        FString Slug = JsonObject->GetStringField(TEXT("slug"));
        UMaestraEntity* CachedEntity = EntityCache.FindRef(Slug);
        if (CachedEntity)
        {
            const TSharedPtr<FJsonObject>* StateObj;
            if (JsonObject->TryGetObjectField(TEXT("state"), StateObj))
            {
                CachedEntity->UpdateStateFromJson(*StateObj);
            }
        }
    }
}

UMaestraEntity* UMaestraClient::GetCachedEntity(const FString& Slug)
{
    return EntityCache.FindRef(Slug);
}
