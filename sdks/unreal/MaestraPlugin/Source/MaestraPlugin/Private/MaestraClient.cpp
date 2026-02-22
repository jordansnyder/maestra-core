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

// ===== Stream Helper Parsers =====

FMaestraStreamInfo UMaestraClient::ParseStreamInfo(TSharedPtr<FJsonObject> JsonObj)
{
    FMaestraStreamInfo Info;
    if (!JsonObj.IsValid()) return Info;

    Info.Id = JsonObj->GetStringField(TEXT("id"));
    Info.Name = JsonObj->GetStringField(TEXT("name"));
    Info.StreamType = JsonObj->GetStringField(TEXT("stream_type"));
    Info.PublisherId = JsonObj->GetStringField(TEXT("publisher_id"));
    Info.Protocol = JsonObj->GetStringField(TEXT("protocol"));
    Info.Address = JsonObj->GetStringField(TEXT("address"));
    Info.Port = JsonObj->GetIntegerField(TEXT("port"));

    if (JsonObj->HasField(TEXT("entity_id")))
    {
        Info.EntityId = JsonObj->GetStringField(TEXT("entity_id"));
    }
    if (JsonObj->HasField(TEXT("active_sessions")))
    {
        Info.ActiveSessions = JsonObj->GetIntegerField(TEXT("active_sessions"));
    }

    return Info;
}

FMaestraStreamSession UMaestraClient::ParseStreamSession(TSharedPtr<FJsonObject> JsonObj)
{
    FMaestraStreamSession Session;
    if (!JsonObj.IsValid()) return Session;

    Session.SessionId = JsonObj->GetStringField(TEXT("session_id"));
    Session.StreamId = JsonObj->GetStringField(TEXT("stream_id"));
    Session.StreamName = JsonObj->GetStringField(TEXT("stream_name"));
    Session.StreamType = JsonObj->GetStringField(TEXT("stream_type"));
    Session.PublisherId = JsonObj->GetStringField(TEXT("publisher_id"));
    Session.ConsumerId = JsonObj->GetStringField(TEXT("consumer_id"));
    Session.Protocol = JsonObj->GetStringField(TEXT("protocol"));

    if (JsonObj->HasField(TEXT("status")))
    {
        Session.Status = JsonObj->GetStringField(TEXT("status"));
    }

    return Session;
}

// ===== Stream Methods =====

void UMaestraClient::GetStreams(const FString& StreamType)
{
    FString Endpoint = TEXT("/streams");
    if (!StreamType.IsEmpty())
    {
        Endpoint += FString::Printf(TEXT("?stream_type=%s"), *StreamType);
    }

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(Endpoint, TEXT("GET"));
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleGetStreamsResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleGetStreamsResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to get streams"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TArray<TSharedPtr<FJsonValue>> JsonArray;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonArray))
    {
        OnError.Broadcast(TEXT("Failed to parse streams JSON"));
        return;
    }

    TArray<FMaestraStreamInfo> Streams;
    for (const TSharedPtr<FJsonValue>& JsonValue : JsonArray)
    {
        Streams.Add(ParseStreamInfo(JsonValue->AsObject()));
    }

    OnStreamsReceived.Broadcast(Streams);
}

void UMaestraClient::GetStream(const FString& StreamId)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/streams/%s"), *StreamId),
        TEXT("GET")
    );

    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleGetStreamResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleGetStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to get stream"));
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
        OnError.Broadcast(TEXT("Failed to parse stream JSON"));
        return;
    }

    FMaestraStreamInfo StreamInfo = ParseStreamInfo(JsonObject);

    // Broadcast as single-element array via OnStreamsReceived for consistency
    TArray<FMaestraStreamInfo> Streams;
    Streams.Add(StreamInfo);
    OnStreamsReceived.Broadcast(Streams);
}

void UMaestraClient::AdvertiseStream(const FMaestraStreamAdvertiseRequest& AdvertiseRequest)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        TEXT("/streams/advertise"),
        TEXT("POST")
    );

    // Build JSON body
    TSharedRef<FJsonObject> JsonObj = MakeShared<FJsonObject>();
    JsonObj->SetStringField(TEXT("name"), AdvertiseRequest.Name);
    JsonObj->SetStringField(TEXT("stream_type"), AdvertiseRequest.StreamType);
    JsonObj->SetStringField(TEXT("publisher_id"), AdvertiseRequest.PublisherId);
    JsonObj->SetStringField(TEXT("protocol"), AdvertiseRequest.Protocol);
    JsonObj->SetStringField(TEXT("address"), AdvertiseRequest.Address);
    JsonObj->SetNumberField(TEXT("port"), AdvertiseRequest.Port);

    if (!AdvertiseRequest.EntityId.IsEmpty())
    {
        JsonObj->SetStringField(TEXT("entity_id"), AdvertiseRequest.EntityId);
    }

    // Parse optional config JSON
    if (!AdvertiseRequest.ConfigJson.IsEmpty())
    {
        TSharedPtr<FJsonObject> ConfigObj;
        TSharedRef<TJsonReader<>> ConfigReader = TJsonReaderFactory<>::Create(AdvertiseRequest.ConfigJson);
        if (FJsonSerializer::Deserialize(ConfigReader, ConfigObj) && ConfigObj.IsValid())
        {
            JsonObj->SetObjectField(TEXT("config"), ConfigObj);
        }
    }

    FString Body;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(JsonObj, Writer);

    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleAdvertiseStreamResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleAdvertiseStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to advertise stream"));
        return;
    }

    if (Response->GetResponseCode() != 200 && Response->GetResponseCode() != 201)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to parse stream response"));
        return;
    }

    FMaestraStreamInfo StreamInfo = ParseStreamInfo(JsonObject);
    OnStreamAdvertised.Broadcast(StreamInfo);
}

void UMaestraClient::WithdrawStream(const FString& StreamId)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/streams/%s"), *StreamId),
        TEXT("DELETE")
    );

    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleWithdrawStreamResponse, StreamId);
    Request->ProcessRequest();
}

void UMaestraClient::HandleWithdrawStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString StreamId)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(FString::Printf(TEXT("Failed to withdraw stream %s"), *StreamId));
        return;
    }

    if (Response->GetResponseCode() != 200 && Response->GetResponseCode() != 204)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d withdrawing stream: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Stream withdrawn: %s"), *StreamId);
}

void UMaestraClient::StreamHeartbeat(const FString& StreamId)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/streams/%s/heartbeat"), *StreamId),
        TEXT("POST")
    );

    Request->SetContentAsString(TEXT("{}"));
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleStreamHeartbeatResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleStreamHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Maestra] Stream heartbeat failed"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Maestra] Stream heartbeat HTTP %d"), Response->GetResponseCode());
    }
}

void UMaestraClient::RequestStream(const FString& StreamId, const FMaestraStreamRequestBody& StreamRequest)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/streams/%s/request"), *StreamId),
        TEXT("POST")
    );

    TSharedRef<FJsonObject> JsonObj = MakeShared<FJsonObject>();
    JsonObj->SetStringField(TEXT("consumer_id"), StreamRequest.ConsumerId);
    JsonObj->SetStringField(TEXT("consumer_address"), StreamRequest.ConsumerAddress);
    if (StreamRequest.ConsumerPort > 0)
    {
        JsonObj->SetNumberField(TEXT("consumer_port"), StreamRequest.ConsumerPort);
    }

    FString Body;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(JsonObj, Writer);

    Request->SetContentAsString(Body);
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleRequestStreamResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleRequestStreamResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to request stream"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d requesting stream: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonObject) || !JsonObject.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to parse stream offer"));
        return;
    }

    FMaestraStreamOffer Offer;
    Offer.SessionId = JsonObject->GetStringField(TEXT("session_id"));
    Offer.StreamId = JsonObject->GetStringField(TEXT("stream_id"));
    Offer.StreamName = JsonObject->GetStringField(TEXT("stream_name"));
    Offer.StreamType = JsonObject->GetStringField(TEXT("stream_type"));
    Offer.Protocol = JsonObject->GetStringField(TEXT("protocol"));
    Offer.PublisherAddress = JsonObject->GetStringField(TEXT("publisher_address"));
    Offer.PublisherPort = JsonObject->GetIntegerField(TEXT("publisher_port"));

    OnStreamOfferReceived.Broadcast(Offer);
}

void UMaestraClient::GetSessions(const FString& StreamId)
{
    FString Endpoint = TEXT("/streams/sessions");
    if (!StreamId.IsEmpty())
    {
        Endpoint += FString::Printf(TEXT("?stream_id=%s"), *StreamId);
    }

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(Endpoint, TEXT("GET"));
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleGetSessionsResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleGetSessionsResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(TEXT("Failed to get sessions"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    TArray<TSharedPtr<FJsonValue>> JsonArray;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Response->GetContentAsString());

    if (!FJsonSerializer::Deserialize(Reader, JsonArray))
    {
        OnError.Broadcast(TEXT("Failed to parse sessions JSON"));
        return;
    }

    TArray<FMaestraStreamSession> Sessions;
    for (const TSharedPtr<FJsonValue>& JsonValue : JsonArray)
    {
        Sessions.Add(ParseStreamSession(JsonValue->AsObject()));
    }

    OnSessionsReceived.Broadcast(Sessions);
}

void UMaestraClient::StopSession(const FString& SessionId)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/streams/sessions/%s"), *SessionId),
        TEXT("DELETE")
    );

    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleStopSessionResponse, SessionId);
    Request->ProcessRequest();
}

void UMaestraClient::HandleStopSessionResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess, FString SessionId)
{
    if (!bSuccess || !Response.IsValid())
    {
        OnError.Broadcast(FString::Printf(TEXT("Failed to stop session %s"), *SessionId));
        return;
    }

    if (Response->GetResponseCode() != 200 && Response->GetResponseCode() != 204)
    {
        OnError.Broadcast(FString::Printf(TEXT("HTTP Error %d stopping session: %s"),
            Response->GetResponseCode(), *Response->GetContentAsString()));
        return;
    }

    UE_LOG(LogTemp, Log, TEXT("[Maestra] Session stopped: %s"), *SessionId);
}

void UMaestraClient::SessionHeartbeat(const FString& SessionId)
{
    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = CreateRequest(
        FString::Printf(TEXT("/streams/sessions/%s/heartbeat"), *SessionId),
        TEXT("POST")
    );

    Request->SetContentAsString(TEXT("{}"));
    Request->OnProcessRequestComplete().BindUObject(this, &UMaestraClient::HandleSessionHeartbeatResponse);
    Request->ProcessRequest();
}

void UMaestraClient::HandleSessionHeartbeatResponse(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bSuccess)
{
    if (!bSuccess || !Response.IsValid())
    {
        UE_LOG(LogTemp, Warning, TEXT("[Maestra] Session heartbeat failed"));
        return;
    }

    if (Response->GetResponseCode() != 200)
    {
        UE_LOG(LogTemp, Warning, TEXT("[Maestra] Session heartbeat HTTP %d"), Response->GetResponseCode());
    }
}
