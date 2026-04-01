/***************************************************
//Web: http://www.buydisplay.com
EastRising Technology Co.,LTD
****************************************************/
#include <SPI.h>
#include "er_oled.h"

// Use HSPI bus since we're on its native pins (SCK=14, MOSI=13)
SPIClass oledSPI(HSPI);


void command(uint8_t cmd)
{
  digitalWrite(OLED_DC, LOW);
  digitalWrite(OLED_CS, LOW);
  oledSPI.transfer(cmd);
  digitalWrite(OLED_CS, HIGH);
}

void data(uint8_t dat)
{
  digitalWrite(OLED_DC, HIGH);
  digitalWrite(OLED_CS, LOW );
  oledSPI.transfer(dat);
  digitalWrite(OLED_CS, HIGH);
}


void er_oled_begin()
{
  Serial.println("[OLED] Begin init");
  Serial.printf("[OLED] Pins: DC=%d, RST=%d, CS=%d, SCK=14, MOSI=13\n", OLED_DC, OLED_RST, OLED_CS);

  // --- GPIO toggle test: verify each pin is alive ---
  Serial.println("[OLED] GPIO toggle test - check each pin with multimeter");
  int testPins[] = {14, 2, OLED_DC, OLED_CS, OLED_RST};
  const char* testNames[] = {"SCK(14)", "MOSI(2)", "DC(15)", "CS(5)", "RST(33)"};
  for (int i = 0; i < 5; i++) {
    if (testPins[i] < 0) continue;
    pinMode(testPins[i], OUTPUT);
    digitalWrite(testPins[i], HIGH);
    delay(200);
    int val = digitalRead(testPins[i]);
    Serial.printf("  %s -> wrote HIGH, read back %s\n", testNames[i], val ? "HIGH" : "LOW");
    digitalWrite(testPins[i], LOW);
    delay(200);
  }
  Serial.println("[OLED] GPIO toggle test done");
  // --- end test ---

  if (OLED_RST >= 0) {
    pinMode(OLED_RST, OUTPUT);
  }
  pinMode(OLED_DC, OUTPUT);
  pinMode(OLED_CS, OUTPUT);
  oledSPI.begin(14, -1, 2, -1);  // UEXT SPI: SCK=GPIO14(pin9), MOSI=GPIO2(pin8), CS managed manually

    oledSPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));  // 1 MHz for debug

  digitalWrite(OLED_CS, LOW);
  if (OLED_RST >= 0) {
    Serial.println("[OLED] Reset pulse");
    digitalWrite(OLED_RST, HIGH);
    delay(100);
    digitalWrite(OLED_RST, LOW);
    delay(100);
    digitalWrite(OLED_RST, HIGH);
    delay(100);
  } else {
    delay(20);
  }

  Serial.println("[OLED] Sending init commands");
  command(0xFD); /*SET COMMAND LOCK*/
  data(0x12); /* UNLOCK */
  command(0xAE); /*DISPLAY OFF*/
  command(0xB3);/*DISPLAYDIVIDE CLOCKRADIO/OSCILLATAR FREQUANCY*/
  data(0x91); command(0xCA); /*multiplex ratio*/
  data(0x3F); /*duty = 1/64*/
  command(0xA2); /*set offset*/
  data(0x00);
  command(0xA1); /*start line*/
  data(0x00);
  command(0xA0); /*set remap*/
  data(0x14);
  data(0x11);

  command(0xAB); /*funtion selection*/
  data(0x01); /* selection external vdd */
  command(0xB4); /* */
  data(0xA0);
  data(0xfd);
  command(0xC1); /*set contrast current */
  data(0x80);
  command(0xC7); /*master contrast current control*/
  data(0x0f);

  command(0xB1); /*SET PHASE LENGTH*/
  data(0xE2);
  command(0xD1); /**/
  data(0x82);
  data(0x20);
  command(0xBB); /*SET PRE-CHANGE VOLTAGE*/
  data(0x1F);
  command(0xB6); /*SET SECOND PRE-CHARGE PERIOD*/
  data(0x08);
  command(0xBE); /* SET VCOMH */
  data(0x07);
  command(0xA6); /*normal display*/
  command(0xAF); /*display ON*/
  Serial.println("[OLED] Display ON command sent");

  // Fill screen with white as a test pattern
  Serial.println("[OLED] Drawing test pattern (full white)");
  command(0x15);
  data(0x00);
  data(0x77);
  command(0x75);
  data(0x00);
  data(0x7f);
  command(0x5c);
  for (int row = 0; row < 128; row++) {
    for (int i = 0; i < 240; i++) {
      data(0xFF);
    }
  }
  Serial.println("[OLED] Test pattern complete - screen should be fully lit");
  delay(2000);  // Hold test pattern for 2 seconds before normal operation
}

void er_oled_SetWindow(uint8_t Xstart, uint8_t Ystart, uint8_t Xend, uint8_t Yend)
{
  command(0x15);
  data(Xstart+0x1c);
  data(Xend+0x1c);
  command(0x75);
  data(Ystart);
  data(Yend);
  command(0x5c);//write ram command
}

void er_oled_clear()
{int i,row;
  command(0x15);
  data(0x00); //col start
  data(0x77); //col end
  command(0x75);
  data(0x00); //row start
  data(0x7f);  //row end
  command(0x5c);
  for (row = 0; row < 128; row++) {
        for(i = 0; i< 240; i++ ) {
          data(0x00);// write data
        }
  }
}

void er_oled_char(uint8_t x, uint8_t y, const char  *acsii, uint8_t mode)
{ uint8_t i,str;uint16_t OffSet;
  x=x/4;
  OffSet = (*acsii - 32)*16;
  er_oled_SetWindow(x, y, x+1, y+15);
  for (i=0;i<16;i++)
  {     str =pgm_read_byte(&AsciiLib[OffSet + i]);
        if(mode) str=~str;
         Data_processing (str);
  }
}

void er_oled_string(uint8_t x, uint8_t y, const char *pString,  uint8_t Mode)
{
  while(1)
  {
        if (*pString == 0)
        {
            return;
        }
            er_oled_char(x, y, pString,Mode);
            x += 8;
            pString += 1;
  }
}

void Data_processing(uint8_t temp)  //turns 1byte B/W data to 4 bye gray data  with 8 Pixel
{uint8_t temp1,temp2;

  if(temp&0x80)temp1=0xf0;
  else temp1=0x00;
  if(temp&0x40)temp2=0x0f;
  else temp2=0x00;
  temp1=temp1|temp2;
  data(temp1); //Pixel1,Pixel2
  if(temp&0x20)temp1=0xf0;
  else temp1=0x00;
  if(temp&0x10)temp2=0x0f;
  else temp2=0x00;
  temp1=temp1|temp2;
  data(temp1);  //Pixel3,Pixel4
  if(temp&0x08)temp1=0xf0;
  else temp1=0x00;
  if(temp&0x04)temp2=0x0f;
  else temp2=0x00;
  temp1=temp1|temp2;
  data(temp1);  //Pixel5,Pixel6
  if(temp&0x02)temp1=0xf0;
  else temp1=0x00;
  if(temp&0x01)temp2=0x0f;
  else temp2=0x00;
  temp1=temp1|temp2;
  data(temp1);  //Pixel7,Pixel8
}

void er_oled_bitmap_mono(const uint8_t * pBuf)
{ uint8_t row,col,dat;
  er_oled_SetWindow(0, 0, 255/4, 63);
  for (row = 0; row < 64; row++) {
        for(col = 0;col<256/8; col++ ) {
        dat=(pgm_read_byte(pBuf));
        *pBuf++;
        Data_processing(dat);
        }
  }
}

void er_oled_bitmap_gray(const uint8_t * pBuf)
{   uint8_t row,col;
  er_oled_SetWindow(0, 0, 255/4, 63);
  for (row = 0; row < 64; row++) {
        for(col = 0;col<128; col++ ) {
        data(pgm_read_byte(pBuf));
        * pBuf++;
        }
  }
}
