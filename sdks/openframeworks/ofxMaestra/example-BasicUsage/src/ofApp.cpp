/**
 * Maestra Basic Usage - OpenFrameworks
 *
 * Demonstrates connecting to Maestra, subscribing to entity state,
 * and publishing state updates from an OF app.
 *
 * Requirements:
 *   - ofxMQTT addon (https://github.com/256dpi/ofxMQTT)
 *   - Maestra running with MQTT broker on port 1883
 *
 * This example:
 *   - Subscribes to a "demo-visual" entity
 *   - Draws a circle whose size and color respond to entity state
 *   - Publishes mouse position as state updates on click
 *   - Toggles active state with spacebar
 */

#include "ofApp.h"

void ofApp::setup() {
    ofSetFrameRate(60);
    ofBackground(25);

    // Configure and connect
    maestra.setBroker("localhost", 1883);
    maestra.setClientId("openframeworks-demo");
    maestra.connect();

    // Get entity reference and register callback BEFORE subscribing
    visual = maestra.getEntity("demo-visual");

    visual->onStateChange([this](const std::string& slug, const ofJson& state,
                                  const std::vector<std::string>& changedKeys) {
        // Update local variables from entity state
        if (state.contains("brightness")) brightness = state["brightness"].get<float>();
        if (state.contains("size")) circleSize = state["size"].get<float>();
        if (state.contains("active")) active = state["active"].get<bool>();
        ofLogNotice("ofApp") << slug << " state changed, keys: " << changedKeys.size();
    });

    // Subscribe to state changes
    maestra.subscribeEntity("demo-visual");
}

void ofApp::update() {
    // Required: process MQTT events
    maestra.update();
}

void ofApp::draw() {
    if (active) {
        // Draw a circle driven by entity state
        ofSetColor(ofColor::fromHsb(140, 200, ofMap(brightness, 0, 100, 0, 255)));
        ofDrawCircle(ofGetWidth() / 2, ofGetHeight() / 2, circleSize / 2);
    }

    // HUD
    ofSetColor(200);
    ofDrawBitmapString("brightness: " + ofToString(brightness, 1), 20, 30);
    ofDrawBitmapString("size: " + ofToString(circleSize, 0), 20, 50);
    ofDrawBitmapString("active: " + ofToString(active), 20, 70);
    ofDrawBitmapString("Click to send mouse position as state", 20, ofGetHeight() - 20);
    ofDrawBitmapString("Space to toggle active", 20, ofGetHeight() - 40);
}

void ofApp::mousePressed(int x, int y, int button) {
    // Publish mouse position as a state update
    ofJson state;
    state["mouse_x"] = x;
    state["mouse_y"] = y;
    state["size"] = ofMap(x, 0, ofGetWidth(), 20, 300);
    state["brightness"] = ofMap(y, 0, ofGetHeight(), 100, 20);
    visual->updateState(state);
}

void ofApp::keyPressed(int key) {
    if (key == ' ') {
        // Toggle active state
        visual->updateState("active", !active);
    }
}
