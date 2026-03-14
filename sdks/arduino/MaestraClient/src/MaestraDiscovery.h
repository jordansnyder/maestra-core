/**
 * Maestra Discovery for ESP32
 * mDNS-based service discovery and device provisioning
 */

#ifndef MAESTRA_DISCOVERY_H
#define MAESTRA_DISCOVERY_H

#include <Arduino.h>

#ifdef ESP32

#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Buffer sizes for discovered URLs
#define MAESTRA_URL_BUFFER_SIZE 128

/**
 * MaestraDiscovery
 * Discovers Maestra services via mDNS and handles device provisioning
 * through the Fleet Manager REST API.
 *
 * ESP32-only: requires ESPmDNS and HTTPClient libraries.
 */
class MaestraDiscovery {
public:
    MaestraDiscovery();

    /**
     * Browse for _maestra._tcp.local. via mDNS.
     * Populates apiUrl, mqttBroker, mqttPort, natsUrl, wsUrl from TXT records.
     * @param timeoutMs  Maximum time to wait for discovery (default 5000ms)
     * @return true if a Maestra service was found
     */
    bool discoverMaestra(unsigned long timeoutMs = 5000);

    /**
     * Announce this device to the Fleet Manager via POST /devices/discover.
     * The device will be created with "pending" status awaiting admin approval.
     * @param hardwareId   Unique hardware identifier (e.g. ESP32 MAC address)
     * @param deviceType   Device type string (e.g. "esp32", "sensor-node")
     * @param name         Optional human-friendly name (defaults to hardwareId)
     * @return true if the device was registered (or already existed)
     */
    bool advertiseDevice(const char* hardwareId, const char* deviceType, const char* name = nullptr);

    /**
     * Poll GET /devices/{id}/provision until the device is approved.
     * On success, mqttBroker/mqttPort/apiUrl/etc. are updated from the
     * provisioning response.
     * @param deviceId         Device UUID returned from advertiseDevice
     * @param pollIntervalMs   Interval between polls (default 5000ms)
     * @param timeoutMs        Maximum wait time (default 300000ms / 5 min)
     * @return true if provisioning config was received
     */
    bool waitForProvisioning(const char* deviceId, unsigned long pollIntervalMs = 5000, unsigned long timeoutMs = 300000);

    // ---- Getters for discovered / provisioned config ----

    const char* getApiUrl()     const { return _apiUrl; }
    const char* getMqttBroker() const { return _mqttBroker; }
    int         getMqttPort()   const { return _mqttPort; }
    const char* getNatsUrl()    const { return _natsUrl; }
    const char* getWsUrl()      const { return _wsUrl; }
    const char* getDeviceId()   const { return _deviceId; }
    const char* getEntityId()   const { return _entityId; }

private:
    char _apiUrl[MAESTRA_URL_BUFFER_SIZE];
    char _mqttBroker[64];
    int  _mqttPort;
    char _natsUrl[MAESTRA_URL_BUFFER_SIZE];
    char _wsUrl[MAESTRA_URL_BUFFER_SIZE];
    char _deviceId[40];
    char _entityId[40];
};

#endif // ESP32

#endif // MAESTRA_DISCOVERY_H
