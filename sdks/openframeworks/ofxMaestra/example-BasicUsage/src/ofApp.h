#pragma once

#include "ofMain.h"
#include "ofxMaestra.h"

class ofApp : public ofBaseApp {
public:
    void setup();
    void update();
    void draw();
    void keyPressed(int key);
    void mousePressed(int x, int y, int button);

private:
    ofxMaestra maestra;
    MaestraEntity* visual = nullptr;

    // State-driven visuals
    float brightness = 50.0f;
    float circleSize = 100.0f;
    bool active = true;
};
