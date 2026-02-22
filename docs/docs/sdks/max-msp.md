# Max/MSP Integration

Max/MSP connects via OSC through the Maestra OSC Gateway.

## Receiving State

```
[udpreceive 57121]
|
[oscparse]
|
[route /maestra/entity/state]
|
[route actuator]
|
[route gallery-light-1]
```

## Sending Updates

```
[dict brightness 75]
|
[prepend /maestra/entity/state/update/gallery-light-1]
|
[oscformat]
|
[udpsend localhost 57120]
```

See `sdks/maxmsp/README.md` for full documentation.
