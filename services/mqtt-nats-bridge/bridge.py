"""
Maestra MQTT-NATS Bridge
Bidirectional message routing between MQTT and NATS
"""

import asyncio
import os
import json
import logging
from datetime import datetime
import paho.mqtt.client as mqtt
import nats
from nats.aio.client import Client as NATS

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO').upper(),
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
logger = logging.getLogger('mqtt-nats-bridge')

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
_loop: asyncio.AbstractEventLoop = None  # main asyncio loop, for cross-thread scheduling


async def connect_nats():
    """Connect to NATS message bus"""
    global nc
    nc = await nats.connect(NATS_URL)
    logger.info("Connected to NATS at %s", NATS_URL)


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


def on_mqtt_connect(client, userdata, flags, reason_code, properties):
    """Callback when MQTT connects (paho v2 API)"""
    if reason_code == 0:
        logger.info("Connected to MQTT broker")
        # Subscribe to all maestra topics
        client.subscribe("maestra/#")
        logger.info("Subscribed to MQTT topic: maestra/#")
    else:
        logger.error("MQTT connection failed: %s", reason_code)


def on_mqtt_message(client, userdata, msg):
    """
    Callback when MQTT message received
    Forward to NATS
    """
    topic = msg.topic
    payload = msg.payload.decode('utf-8', errors='ignore')

    logger.debug("MQTT -> NATS: %s", topic)

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

    # Publish to NATS (schedule on the main asyncio loop from paho's thread)
    if nc and _loop:
        asyncio.run_coroutine_threadsafe(publish_to_nats(nats_subject, message), _loop)


async def publish_to_nats(subject: str, message: dict):
    """Publish message to NATS"""
    try:
        await nc.publish(subject, json.dumps(message).encode())
        logger.debug("Published to NATS: %s", subject)
    except Exception as e:
        logger.error("Error publishing to NATS: %s", e)


async def nats_message_handler(msg):
    """
    Callback when NATS message received
    Forward to MQTT
    """
    subject = msg.subject

    logger.debug("NATS -> MQTT: %s", subject)

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
        logger.debug("Published to MQTT: %s", mqtt_topic)
    else:
        logger.warning("MQTT not connected, skipping message")


async def subscribe_nats_to_mqtt():
    """Subscribe to NATS topics for forwarding to MQTT"""
    if nc:
        await nc.subscribe(NATS_TO_MQTT_SUBJECT, cb=nats_message_handler)
        logger.info("Subscribed to NATS subject: %s", NATS_TO_MQTT_SUBJECT)


def setup_mqtt():
    """Setup MQTT client"""
    global mqtt_client

    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, "maestra-mqtt-nats-bridge")
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message

    logger.info("Connecting to MQTT broker at %s:%d...", MQTT_BROKER, MQTT_PORT)
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()


async def main():
    """Main bridge loop"""

    global _loop

    logger.info("Starting Maestra MQTT-NATS Bridge...")

    # Store the running loop so MQTT callbacks can schedule async work
    _loop = asyncio.get_running_loop()

    # Connect to NATS
    await connect_nats()

    # Subscribe to NATS for outgoing MQTT messages
    await subscribe_nats_to_mqtt()

    # Setup MQTT client
    setup_mqtt()

    logger.info("Bridge ready!")
    logger.info("Message Flow:")
    logger.info("  MQTT (maestra/#) -> NATS (maestra.mqtt.*)")
    logger.info("  NATS (maestra.to_mqtt.*) -> MQTT (*)")

    # Keep running
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down MQTT-NATS Bridge...")
    finally:
        if mqtt_client:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        if nc:
            await nc.close()


if __name__ == "__main__":
    asyncio.run(main())
