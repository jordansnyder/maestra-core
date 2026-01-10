// Copyright Maestra Team. All Rights Reserved.

#include "MaestraPlugin.h"

#define LOCTEXT_NAMESPACE "FMaestraPluginModule"

void FMaestraPluginModule::StartupModule()
{
    UE_LOG(LogTemp, Log, TEXT("Maestra Plugin: Module started"));
}

void FMaestraPluginModule::ShutdownModule()
{
    UE_LOG(LogTemp, Log, TEXT("Maestra Plugin: Module shutdown"));
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FMaestraPluginModule, MaestraPlugin)
