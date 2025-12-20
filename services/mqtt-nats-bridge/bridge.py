"""
Maestra MQTT-NATS Bridge
Bidirectional message routing between MQTT and NATS
"""

import asyncio
import os
import json
from datetime import datetime
import paho.mqtt.client as mqtt
import nats
from nats.aio.client import Client as NATS

# Configuration
MQTT_BROKER = os.getenv('MQTT_BROKER', 'mosquitto')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
NATS_URL = os.getenv('NATS_URL', 'nats://nats:4222')

# Topic mapping configuration
MQTT_TO_NATS_PREFIX = "maestra.mqtt"  # MQTT topic "device/sensor" -> NATS "maestra.mqtt.device.sensor"
NATS_TO_MQTT_SUBJECT = "maestra.to_mqtt.>"  # NATS "maestra.to_mqtt.device.cmd" -> MQTT "device/cmd"

# Global clients
nc: NATS = None
mqtt_client: mqtt.Client = None


async def connect_nats():
    """Connect to NATS message bus"""
    global nc
    nc = await nats.connect(NATS_URL)
    print(f"✅ Connected to NATS at {NATS_URL}")


def mqtt_topic_to_nats_subject(topic: str) -> str:
    """
    Convert MQTT topic to NATS subject
    Example: "maestra/devices/esp32/sensor" -> "maestra.mqtt.maestra.devices.esp32.sensor"
    """
    # Replace / with . for NATS subject format
    subject = topic.replace('/', '.')
    return f"{MQTT_TO_NATS_PREFIX}.{subject}"


def nats_subject_to_mqtt_topic(subject: str) -> str:
    """
    Convert NATS subject to MQTT topic
    Example: "maestra.to_mqtt.devices.esp32.cmd" -> "devices/esp32/cmd"
    """
    # Remove the "maestra.to_mqtt." prefix
    if subject.startswith("maestra.to_mqtt."):
        topic = subject[len("maestra.to_mqtt."):]
        # Replace . with / for MQTT topic format
        return topic.replace('.', '/')
    return subject


def on_mqtt_connect(client, userdata, flags, rc):
    """Callback when MQTT connects"""
    if rc == 0:
        print("✅ Connected to MQTT broker")
        # Subscribe to all maestra topics
        client.subscribe("maestra/#")
        print("📡 Subscribed to MQTT topic: maestra/#")
    else:
        print(f"❌ MQTT connection failed with code: {rc}")


def on_mqtt_message(client, userdata, msg):
    """
    Callback when MQTT message received
    Forward to NATS
    """
    topic = msg.topic
    payload = msg.payload.decode('utf-8', errors='ignore')

    print(f"📨 MQTT -> NATS: {topic}")

    # Convert MQTT topic to NATS subject
    nats_subject = mqtt_topic_to_nats_subject(topic)

    # Create message envelope with metadata
    message = {
        "source": "mqtt",
        "topic": topic,
        "payload": payload,
        "qos": msg.qos,
        "timestamp": datetime.utcnow().isoformat()
    }

    # Try to parse as JSON, otherwise keep as string
    try:
        parsed = json.loads(payload)
        message["data"] = parsed
    except (json.JSONDecodeError, ValueError):
        message["data"] = payload

    # Publish to NATS
    if nc:
        asyncio.create_task(publish_to_nats(nats_subject, message))


async def publish_to_nats(subject: str, message: dict):
    """Publish message to NATS"""
    try:
        await nc.publish(subject, json.dumps(message).encode())
        print(f"✅ Published to NATS: {subject}")
    except Exception as e:
        print(f"❌ Error publishing to NATS: {e}")


async def nats_message_handler(msg):
    """
    Callback when NATS message received
    Forward to MQTT
    """
    subject = msg.subject

    print(f"📨 NATS -> MQTT: {subject}")

    try:
        data = json.loads(msg.data.decode())
    except (json.JSONDecodeError, ValueError):
        data = {"payload": msg.data.decode()}

    # Convert NATS subject to MQTT topic
    mqtt_topic = nats_subject_to_mqtt_topic(subject)

    # Extract payload
    if isinstance(data, dict):
        # If there's a "payload" field, use it
        payload = data.get("payload", json.dumps(data))
    else:
        payload = str(data)

    # Publish to MQTT
    if mqtt_client and mqtt_client.is_connected():
        mqtt_client.publish(mqtt_topic, payload)
        print(f"✅ Published to MQTT: {mqtt_topic}")
    else:
        print("⚠️  MQTT not connected, skipping message")


async def subscribe_nats_to_mqtt():
    """Subscribe to NATS topics for forwarding to MQTT"""
    if nc:
        await nc.subscribe(NATS_TO_MQTT_SUBJECT, cb=nats_message_handler)
        print(f"📡 Subscribed to NATS subject: {NATS_TO_MQTT_SUBJECT}")


def setup_mqtt():
    """Setup MQTT client"""
    global mqtt_client

    mqtt_client = mqtt.Client("maestra-mqtt-nats-bridge")
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message

    print(f"🔌 Connecting to MQTT broker at {MQTT_BROKER}:{MQTT_PORT}...")
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()


async def main():
    """Main bridge loop"""

    print("🚀 Starting Maestra MQTT-NATS Bridge...")
    print("=" * 60)

    # Connect to NATS
    await connect_nats()

    # Subscribe to NATS for outgoing MQTT messages
    await subscribe_nats_to_mqtt()

    # Setup MQTT client
    setup_mqtt()

    print("=" * 60)
    print("✅ Bridge ready!")
    print()
    print("📊 Message Flow:")
    print("   MQTT (maestra/#) → NATS (maestra.mqtt.*)")
    print("   NATS (maestra.to_mqtt.*) → MQTT (*)")
    print()
    print("📚 Examples:")
    print("   MQTT: maestra/devices/esp32/temp → NATS: maestra.mqtt.maestra.devices.esp32.temp")
    print("   NATS: maestra.to_mqtt.devices.esp32.cmd → MQTT: devices/esp32/cmd")
    print("=" * 60)

    # Keep running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Shutting down MQTT-NATS Bridge...")
    finally:
        if mqtt_client:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        if nc:
            await nc.close()


if __name__ == "__main__":
    asyncio.run(main())
