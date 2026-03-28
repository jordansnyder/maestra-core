/**
 * Maestra Basic Usage - Processing
 *
 * Demonstrates connecting to Maestra, subscribing to entity state,
 * and publishing state updates from a Processing sketch.
 *
 * Requirements:
 *   - processing-mqtt library (install via Sketch > Import Library > Manage Libraries)
 *   - Maestra running with MQTT broker on port 1883
 *
 * This sketch:
 *   - Subscribes to a "demo-visual" entity
 *   - Draws a circle whose size and color respond to entity state
 *   - Publishes mouse position as state updates when mouse is pressed
 */

import mqtt.*;
import maestra.*;

MaestraClient maestra;
MaestraEntity visual;

// State-driven visuals
float brightness = 50;
int circleSize = 100;
boolean active = true;

void setup() {
  size(800, 600);
  colorMode(HSB, 360, 100, 100);

  // Create and configure the Maestra client
  maestra = new MaestraClient(this);
  maestra.setBroker("localhost", 1883);
  maestra.setClientId("processing-demo");
  maestra.connect();

  // Get entity reference and register callback BEFORE subscribing
  visual = maestra.getEntity("demo-visual");
  visual.onStateChange(new StateChangeCallback() {
    public void stateChanged(String slug, JSONObject state, JSONArray changedKeys) {
      // Update local variables from entity state
      if (state.hasKey("brightness")) brightness = state.getFloat("brightness");
      if (state.hasKey("size")) circleSize = state.getInt("size");
      if (state.hasKey("active")) active = state.getBoolean("active");
      println("[Maestra] " + slug + " state changed: " + changedKeys);
    }
  });

  // Subscribe to state changes
  maestra.subscribeEntity("demo-visual");
}

void draw() {
  // REQUIRED: process incoming MQTT messages on the main thread
  maestra.update();

  background(0, 0, 10);

  if (active) {
    // Draw a circle driven by entity state
    fill(200, 80, brightness);
    noStroke();
    ellipse(width / 2, height / 2, circleSize, circleSize);
  }

  // HUD
  fill(0, 0, 80);
  textSize(14);
  text("brightness: " + nf(brightness, 0, 1), 20, 30);
  text("size: " + circleSize, 20, 50);
  text("active: " + active, 20, 70);
  text("Click to send mouse position as state", 20, height - 20);
}

void mousePressed() {
  // Publish mouse position as a state update
  JSONObject state = new JSONObject();
  state.put("mouse_x", mouseX);
  state.put("mouse_y", mouseY);
  state.put("size", (int) map(mouseX, 0, width, 20, 300));
  state.put("brightness", map(mouseY, 0, height, 100, 20));
  visual.updateState(state);
}

void keyPressed() {
  if (key == ' ') {
    // Toggle active state
    visual.updateState("active", !active);
  }
}

// ========================================================================
// Required MQTT callbacks (processing-mqtt routes these to the sketch)
// ========================================================================

void clientConnected() {
  println("[MQTT] Connected");
}

void messageReceived(String topic, byte[] payload) {
  maestra.messageReceived(topic, new String(payload));
}

void connectionLost() {
  maestra.connectionLost();
}
