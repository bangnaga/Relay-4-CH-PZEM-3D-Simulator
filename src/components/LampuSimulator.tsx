import { useEffect, useRef, useState } from "react";
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  PointLight,
  SpotLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  GlowLayer,
  Mesh,
} from "@babylonjs/core";
import { LightState } from "../types";
import { HelpCircle, RefreshCw } from "lucide-react";

interface LampuSimulatorProps {
  state: LightState;
  onChannelClick?: (channelId: number) => void;
}

// Helper to convert hex strings to Babylon Color3
function hexToColor3(hex: string): Color3 {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

export default function LampuSimulator({
  state,
  onChannelClick,
}: LampuSimulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<Scene | null>(null);

  // References for live 3D property updates
  const ambientLightRef = useRef<HemisphericLight | null>(null);
  
  // Relay references
  const relayLEDsRef = useRef<Mesh[]>([]);
  const espStatusLEDRef = useRef<Mesh | null>(null);
  const pzemTXLEDRef = useRef<Mesh | null>(null);

  // Appliance materials / lights
  // Channel 1: Lampu Dinding
  const sconceGlowUpMatRef = useRef<StandardMaterial | null>(null);
  const sconceGlowDownMatRef = useRef<StandardMaterial | null>(null);
  const spotLightUpRef = useRef<SpotLight | null>(null);
  const spotLightDownRef = useRef<SpotLight | null>(null);
  const pointLightSconceRef = useRef<PointLight | null>(null);

  // Channel 2: Lampu Plafon
  const ceilingGlowMatRef = useRef<StandardMaterial | null>(null);
  const pointLightCeilingRef = useRef<PointLight | null>(null);

  // Channel 3: Lampu Belajar
  const deskLampGlowMatRef = useRef<StandardMaterial | null>(null);
  const pointLightDeskRef = useRef<PointLight | null>(null);

  // Channel 4: AC references
  const acDisplayLEDMatRef = useRef<StandardMaterial | null>(null);
  const acBreezeMeshRef = useRef<Mesh | null>(null);

  // Cache materials
  const ledOnMatRef = useRef<StandardMaterial | null>(null);
  const ledOffMatRef = useRef<StandardMaterial | null>(null);
  const redLedOnMatRef = useRef<StandardMaterial | null>(null);
  const redLedOffMatRef = useRef<StandardMaterial | null>(null);

  const [loading, setLoading] = useState(true);
  const [showHelperText, setShowHelperText] = useState(true);

  // Align camera perfectly to view both the tabletop sirkuit and wall appliances
  const resetCamera = () => {
    if (sceneRef.current) {
      const camera = sceneRef.current.activeCamera as ArcRotateCamera;
      if (camera) {
        camera.setTarget(new Vector3(0, 1.15, 0.15));
        camera.alpha = -Math.PI / 2; // Front-center look
        camera.beta = Math.PI / 3.2; // Slightly higher slant looking down
        camera.radius = 2.15;
      }
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // 1. Initialize Engine
    const engine = new Engine(canvasRef.current, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;

    // 2. Initialize Scene
    const scene = new Scene(engine);
    scene.clearColor = new Color3(0.015, 0.025, 0.05).toColor4();
    sceneRef.current = scene;

    // 3. Setup Camera (tuned precisely)
    const camera = new ArcRotateCamera(
      "mainCamera",
      -Math.PI / 2,
      Math.PI / 3.2,
      2.15,
      new Vector3(0, 1.15, 0.15),
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.lowerRadiusLimit = 1.25;
    camera.upperRadiusLimit = 4.0;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.15; // Prevent going underneath desk

    // 4. Glow Layer for photorealistic glows on LEDs and sconces
    const glow = new GlowLayer("glow", scene);
    glow.intensity = 1.0;

    // 5. Setup Ambient Light (Room Ambient Slider Simulation)
    const ambientLight = new HemisphericLight(
      "ambientLight",
      new Vector3(0, 1, 0),
      scene
    );
    ambientLight.intensity = state.ambientLight / 100;
    ambientLight.diffuse = new Color3(0.55, 0.65, 0.85); // soft daylight blue
    ambientLight.groundColor = new Color3(0.12, 0.12, 0.16);
    ambientLightRef.current = ambientLight;

    // ================= GLOBAL SCENE MATERIALS =================
    const metalMat = new StandardMaterial("metalMat", scene);
    metalMat.diffuseColor = new Color3(0.75, 0.75, 0.75);
    metalMat.specularColor = new Color3(0.95, 0.95, 0.95);
    metalMat.roughness = 0.1;

    const goldMat = new StandardMaterial("goldMat", scene);
    goldMat.diffuseColor = new Color3(0.85, 0.65, 0.15);
    goldMat.specularColor = new Color3(0.9, 0.8, 0.4);
    goldMat.roughness = 0.2;

    const ledOffMat = new StandardMaterial("ledOffMat", scene);
    ledOffMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
    ledOffMat.specularColor = new Color3(0.05, 0.05, 0.05);
    ledOffMatRef.current = ledOffMat;

    const ledOnMat = new StandardMaterial("ledOnMat", scene);
    ledOnMat.diffuseColor = new Color3(0.1, 0.95, 0.1);
    ledOnMat.emissiveColor = new Color3(0.1, 0.85, 0.1); // glowing green
    ledOnMatRef.current = ledOnMat;

    const redLedOffMat = new StandardMaterial("redLedOffMat", scene);
    redLedOffMat.diffuseColor = new Color3(0.18, 0.02, 0.02);
    redLedOffMat.specularColor = new Color3(0.05, 0.05, 0.05);
    redLedOffMatRef.current = redLedOffMat;

    const redLedOnMat = new StandardMaterial("redLedOnMat", scene);
    redLedOnMat.diffuseColor = new Color3(0.95, 0.1, 0.1);
    redLedOnMat.emissiveColor = new Color3(0.85, 0.1, 0.1); // glowing red
    redLedOnMatRef.current = redLedOnMat;

    const blueLedOnMat = new StandardMaterial("blueLedOnMat", scene);
    blueLedOnMat.diffuseColor = new Color3(0.1, 0.45, 0.95);
    blueLedOnMat.emissiveColor = new Color3(0.1, 0.35, 0.85); // glowing blue

    const tableMat = new StandardMaterial("tableMat", scene);
    tableMat.diffuseColor = new Color3(0.18, 0.22, 0.28); // Slate table top
    tableMat.specularColor = new Color3(0.1, 0.1, 0.1);
    tableMat.roughness = 0.6;

    // --- Ground/Floor ---
    const floor = MeshBuilder.CreatePlane("floor", { size: 10 }, scene);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = 0;
    const floorMat = new StandardMaterial("floorMat", scene);
    floorMat.diffuseColor = new Color3(0.12, 0.12, 0.15);
    floorMat.specularColor = new Color3(0.02, 0.02, 0.02);
    floor.material = floorMat;
    floor.receiveShadows = true;

    // --- Back Wall ---
    const backWall = MeshBuilder.CreatePlane("backWall", { size: 10 }, scene);
    backWall.position.z = 2.5;
    backWall.position.y = 5;
    const wallMat = new StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new Color3(0.09, 0.11, 0.15); // Deep space wall
    wallMat.specularColor = new Color3(0.03, 0.03, 0.03);
    backWall.material = wallMat;
    backWall.receiveShadows = true;

    // --- Desk/Table ---
    const tableTop = MeshBuilder.CreateBox(
      "tableTop",
      { width: 3.2, height: 0.06, depth: 1.6 },
      scene
    );
    tableTop.position.set(0, 0.75, 0);
    tableTop.material = tableMat;
    tableTop.receiveShadows = true;

    // Table legs
    const legCoords = [
      [-1.4, -0.7],
      [1.4, -0.7],
      [-1.4, 0.7],
      [1.4, 0.7],
    ];
    const legMat = new StandardMaterial("legMat", scene);
    legMat.diffuseColor = new Color3(0.04, 0.04, 0.04); // Matte black steel
    legCoords.forEach(([x, z], i) => {
      const leg = MeshBuilder.CreateCylinder(
        `leg_${i}`,
        { height: 0.75, diameter: 0.06 },
        scene
      );
      leg.position.set(x, 0.375, z);
      leg.material = legMat;
    });

    // ================= PROTOTYPING BASE WOOD STAND =================
    const baseBoard = MeshBuilder.CreateBox(
      "baseBoard",
      { width: 1.35, height: 0.03, depth: 0.85 },
      scene
    );
    baseBoard.position.set(0, 0.795, 0.05);
    const baseBoardMat = new StandardMaterial("baseBoardMat", scene);
    baseBoardMat.diffuseColor = new Color3(0.28, 0.18, 0.12); // Rich mahogany
    baseBoardMat.specularColor = new Color3(0.04, 0.04, 0.04);
    baseBoardMat.roughness = 0.5;
    baseBoard.material = baseBoardMat;
    baseBoard.receiveShadows = true;

    // ================= ESP32 BOARD MESH =================
    const espPCB = MeshBuilder.CreateBox(
      "espPCB",
      { width: 0.2, height: 0.008, depth: 0.28 },
      scene
    );
    espPCB.position.set(-0.45, 0.814, -0.15);
    const espPCBMat = new StandardMaterial("espPCBMat", scene);
    espPCBMat.diffuseColor = new Color3(0.06, 0.15, 0.08); // Emerald solder mask
    espPCBMat.specularColor = new Color3(0.15, 0.15, 0.15);
    espPCB.material = espPCBMat;
    espPCB.receiveShadows = true;

    // WiFi Module Metal Shield
    const espShield = MeshBuilder.CreateBox(
      "espShield",
      { width: 0.08, height: 0.015, depth: 0.11 },
      scene
    );
    espShield.position.set(-0.45, 0.825, -0.12);
    espShield.material = metalMat;

    // Black Pin Headers
    const headerLeft = MeshBuilder.CreateBox(
      "headerLeft",
      { width: 0.015, height: 0.015, depth: 0.24 },
      scene
    );
    headerLeft.position.set(-0.52, 0.825, -0.15);
    const headerMat = new StandardMaterial("headerMat", scene);
    headerMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
    headerLeft.material = headerMat;

    const headerRight = MeshBuilder.CreateBox(
      "headerRight",
      { width: 0.015, height: 0.015, depth: 0.24 },
      scene
    );
    headerRight.position.set(-0.38, 0.825, -0.15);
    headerRight.material = headerMat;

    // USB Port
    const usbPort = MeshBuilder.CreateBox(
      "usbPort",
      { width: 0.035, height: 0.015, depth: 0.025 },
      scene
    );
    usbPort.position.set(-0.45, 0.825, -0.28);
    usbPort.material = metalMat;

    // Onboard LEDs
    const espPowerLED = MeshBuilder.CreateSphere("espPowerLED", { diameter: 0.01 }, scene);
    espPowerLED.position.set(-0.48, 0.822, -0.25);
    espPowerLED.material = redLedOnMat;

    const espStatusLED = MeshBuilder.CreateSphere("espStatusLED", { diameter: 0.01 }, scene);
    espStatusLED.position.set(-0.42, 0.822, -0.25);
    espStatusLED.material = blueLedOnMat;
    espStatusLEDRef.current = espStatusLED;

    // ================= 4-CHANNEL RELAY BOARD MESH =================
    // Wider blue relay board (holds 4 Songle cubes)
    const relayPCB = MeshBuilder.CreateBox(
      "relayPCB",
      { width: 0.28, height: 0.008, depth: 0.22 },
      scene
    );
    relayPCB.position.set(-0.11, 0.814, -0.15);
    const relayPCBMat = new StandardMaterial("relayPCBMat", scene);
    relayPCBMat.diffuseColor = new Color3(0.05, 0.12, 0.24); // Industrial blue
    relayPCBMat.specularColor = new Color3(0.15, 0.15, 0.15);
    relayPCB.material = relayPCBMat;
    relayPCB.receiveShadows = true;

    const relayBlueMat = new StandardMaterial("relayBlueMat", scene);
    relayBlueMat.diffuseColor = new Color3(0.02, 0.26, 0.55); // Blue Songle relays
    relayBlueMat.specularColor = new Color3(0.2, 0.2, 0.2);

    const greenTerminalMat = new StandardMaterial("greenTerminalMat", scene);
    greenTerminalMat.diffuseColor = new Color3(0.08, 0.44, 0.14); // Green blocks

    const relayCubes: Mesh[] = [];
    const relayLEDs: Mesh[] = [];

    // Construct 4 Relay Channels
    for (let i = 0; i < 4; i++) {
      const xOffset = -0.09 + i * 0.06;

      // Relay Cube
      const cube = MeshBuilder.CreateBox(
        `relayCube_${i}`,
        { width: 0.048, height: 0.042, depth: 0.075 },
        scene
      );
      cube.position.set(-0.11 + xOffset, 0.839, -0.14);
      cube.material = relayBlueMat;
      cube.receiveShadows = true;
      relayCubes.push(cube);

      // Screw Terminal Block (3 pins per relay)
      const terminal = MeshBuilder.CreateBox(
        `relayTerm_${i}`,
        { width: 0.048, height: 0.035, depth: 0.035 },
        scene
      );
      terminal.position.set(-0.11 + xOffset, 0.835, -0.21);
      terminal.material = greenTerminalMat;

      // Screw terminals indent
      const terminalsIndent = MeshBuilder.CreateBox(
        `termIndent_${i}`,
        { width: 0.038, height: 0.006, depth: 0.012 },
        scene
      );
      terminalsIndent.position.set(-0.11 + xOffset, 0.853, -0.215);
      const screwMat = new StandardMaterial("screwMat", scene);
      screwMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
      terminalsIndent.material = screwMat;

      // Relay Status LED
      const led = MeshBuilder.CreateSphere(
        `relayLED_${i}`,
        { diameter: 0.01 },
        scene
      );
      led.position.set(-0.11 + xOffset, 0.822, -0.07);
      led.material = ledOffMat;
      relayLEDs.push(led);
    }
    relayLEDsRef.current = relayLEDs;

    // ================= PZEM-004T SENSOR BOARD MESH =================
    // Blue PZEM-004T energy monitor board
    const pzemPCB = MeshBuilder.CreateBox(
      "pzemPCB",
      { width: 0.18, height: 0.008, depth: 0.15 },
      scene
    );
    pzemPCB.position.set(0.2, 0.814, -0.15);
    const pzemPCBMat = new StandardMaterial("pzemPCBMat", scene);
    pzemPCBMat.diffuseColor = new Color3(0.04, 0.08, 0.16); // dark navy/teal PCB
    pzemPCB.material = pzemPCBMat;
    pzemPCB.receiveShadows = true;

    const chipMat = new StandardMaterial("chipMat", scene);
    chipMat.diffuseColor = new Color3(0.15, 0.15, 0.15);

    // Small black chip representing the V9881D chip inside PZEM
    const pzemChip = MeshBuilder.CreateBox(
      "pzemChip",
      { width: 0.035, height: 0.006, depth: 0.035 },
      scene
    );
    pzemChip.position.set(0.17, 0.821, -0.17);
    pzemChip.material = chipMat;

    // Optocoupler chips (safety isolation)
    for (let i = 0; i < 3; i++) {
      const opto = MeshBuilder.CreateBox(
        `pzemOpto_${i}`,
        { width: 0.015, height: 0.008, depth: 0.025 },
        scene
      );
      opto.position.set(0.14 + i * 0.025, 0.822, -0.11);
      opto.material = chipMat;
    }

    // High Voltage Terminal Block
    const pzemHighTerm = MeshBuilder.CreateBox(
      "pzemHighTerm",
      { width: 0.05, height: 0.035, depth: 0.035 },
      scene
    );
    pzemHighTerm.position.set(0.24, 0.835, -0.21);
    pzemHighTerm.material = greenTerminalMat;

    // CT Coil wire terminal connector
    const pzemCtTerm = MeshBuilder.CreateBox(
      "pzemCtTerm",
      { width: 0.03, height: 0.025, depth: 0.025 },
      scene
    );
    pzemCtTerm.position.set(0.15, 0.83, -0.21);
    const ctTermMat = new StandardMaterial("ctTermMat", scene);
    ctTermMat.diffuseColor = new Color3(0.18, 0.18, 0.18);
    pzemCtTerm.material = ctTermMat;

    // PZEM-004T Status Telemetry LED
    const pzemTXLED = MeshBuilder.CreateSphere("pzemTXLED", { diameter: 0.01 }, scene);
    pzemTXLED.position.set(0.25, 0.822, -0.09);
    pzemTXLED.material = redLedOffMat;
    pzemTXLEDRef.current = pzemTXLED;

    // 3D CURRENT TRANSFORMER (CT) COIL TORUS
    const pzemCT = MeshBuilder.CreateTorus(
      "pzemCT",
      { diameter: 0.075, thickness: 0.024, tessellation: 20 },
      scene
    );
    pzemCT.position.set(0.22, 0.84, -0.02);
    pzemCT.rotation.x = Math.PI / 2;
    const ctMat = new StandardMaterial("ctMat", scene);
    ctMat.diffuseColor = new Color3(0.08, 0.08, 0.08); // Matte black casing
    ctMat.roughness = 0.5;
    pzemCT.material = ctMat;

    // Blue wrapper coil tape on CT
    const ctWrapper = MeshBuilder.CreateBox(
      "ctWrapper",
      { width: 0.015, height: 0.026, depth: 0.035 },
      scene
    );
    ctWrapper.position.set(0.22, 0.865, -0.02);
    const wrapperMat = new StandardMaterial("wrapperMat", scene);
    wrapperMat.diffuseColor = new Color3(0.1, 0.35, 0.75); // Blue vinyl tape
    ctWrapper.material = wrapperMat;

    // ================= APPLIANCES MOUNTED ON BACK WALL / DESK =================

    // --- 1. WALL SCONCE (LAMPU DINDING) ON THE LEFT ---
    const sconceX = -0.55;
    const sconceY = 1.35;
    const sconceZ = 2.45;

    // Mounting bracket plate on wall
    const sconcePlate = MeshBuilder.CreateBox(
      "sconcePlate",
      { width: 0.07, height: 0.07, depth: 0.012 },
      scene
    );
    sconcePlate.position.set(sconceX, sconceY, sconceZ - 0.006);
    sconcePlate.material = goldMat;

    // Connecting arm
    const sconceArm = MeshBuilder.CreateCylinder(
      "sconceArm",
      { height: 0.08, diameter: 0.015 },
      scene
    );
    sconceArm.position.set(sconceX, sconceY, sconceZ - 0.045);
    sconceArm.rotation.x = Math.PI / 2;
    sconceArm.material = goldMat;

    // Sconce cylindrical body
    const sconceBody = MeshBuilder.CreateCylinder(
      "wallLightBody",
      { height: 0.22, diameter: 0.052 },
      scene
    );
    sconceBody.position.set(sconceX, sconceY, sconceZ - 0.085);
    sconceBody.material = goldMat;

    // Glowing emitter caps (Up and Down)
    const sconceCapUp = MeshBuilder.CreateCylinder(
      "sconceCapUp",
      { height: 0.01, diameter: 0.048 },
      scene
    );
    sconceCapUp.position.set(sconceX, sconceY + 0.111, sconceZ - 0.085);
    const sGlowUpMat = new StandardMaterial("sGlowUpMat", scene);
    sGlowUpMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    sGlowUpMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    sconceCapUp.material = sGlowUpMat;
    sconceGlowUpMatRef.current = sGlowUpMat;

    const sconceCapDown = MeshBuilder.CreateCylinder(
      "sconceCapDown",
      { height: 0.01, diameter: 0.048 },
      scene
    );
    sconceCapDown.position.set(sconceX, sconceY - 0.111, sconceZ - 0.085);
    const sGlowDownMat = new StandardMaterial("sGlowDownMat", scene);
    sGlowDownMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    sGlowDownMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    sconceCapDown.material = sGlowDownMat;
    sconceGlowDownMatRef.current = sGlowDownMat;

    // Compact PointLight for Wall Sconce general ambient
    const pointLightSconce = new PointLight(
      "pointLightSconce",
      new Vector3(sconceX, sconceY - 0.15, sconceZ - 0.1),
      scene
    );
    pointLightSconce.range = 2.5;
    pointLightSconce.intensity = 0;
    pointLightSconceRef.current = pointLightSconce;

    // Wall washers (Up & Down)
    const spotDown = new SpotLight(
      "wallLightSpotDown",
      new Vector3(sconceX, sconceY - 0.12, sconceZ - 0.085),
      new Vector3(0, -1, -0.05),
      Math.PI / 2.8,
      3,
      scene
    );
    spotDown.range = 2.4;
    spotDown.intensity = 0;
    spotLightDownRef.current = spotDown;

    const spotUp = new SpotLight(
      "wallLightSpotUp",
      new Vector3(sconceX, sconceY + 0.12, sconceZ - 0.085),
      new Vector3(0, 1, -0.05),
      Math.PI / 2.8,
      3,
      scene
    );
    spotUp.range = 2.2;
    spotUp.intensity = 0;
    spotLightUpRef.current = spotUp;

    // --- 2. CEILING DOME LAMP (LAMPU PLAFON) IN THE UPPER MIDDLE ---
    const ceilingX = 0.0;
    const ceilingY = 1.95;
    const ceilingZ = 2.45;

    // Sleek geometric circular recess dome
    const ceilingRecess = MeshBuilder.CreateCylinder(
      "ceilingRecess",
      { height: 0.015, diameter: 0.22 },
      scene
    );
    ceilingRecess.position.set(ceilingX, ceilingY, ceilingZ - 0.008);
    ceilingRecess.rotation.x = Math.PI / 2;
    ceilingRecess.material = metalMat;

    // Inside glowing light dome
    const ceilingDome = MeshBuilder.CreateSphere(
      "ceilingDomeMesh",
      { diameterX: 0.18, diameterY: 0.08, diameterZ: 0.18, slice: 0.5 },
      scene
    );
    ceilingDome.position.set(ceilingX, ceilingY, ceilingZ - 0.015);
    ceilingDome.rotation.x = Math.PI / 2;
    const ceilingGlowMat = new StandardMaterial("ceilingGlowMat", scene);
    ceilingGlowMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    ceilingGlowMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    ceilingDome.material = ceilingGlowMat;
    ceilingGlowMatRef.current = ceilingGlowMat;

    // PointLight for Ceiling Dome (Shines down on the whole scene)
    const pointLightCeiling = new PointLight(
      "pointLightCeiling",
      new Vector3(ceilingX, ceilingY - 0.1, ceilingZ - 0.15),
      scene
    );
    pointLightCeiling.range = 4.0;
    pointLightCeiling.intensity = 0;
    pointLightCeilingRef.current = pointLightCeiling;

    // --- 3. DESK STUDY LAMP (LAMPU BELAJAR) ON THE DESK ---
    const deskLampX = -0.16;
    const deskLampY = 0.81; // Desk base top
    const deskLampZ = 0.28;

    // Heavy round base
    const lampBase = MeshBuilder.CreateCylinder(
      "lampBase",
      { height: 0.015, diameter: 0.075 },
      scene
    );
    lampBase.position.set(deskLampX, deskLampY + 0.0075, deskLampZ);
    lampBase.material = metalMat;

    // Sleek angled armature arm
    const lampStem = MeshBuilder.CreateCylinder(
      "lampStem",
      { height: 0.24, diameter: 0.01 },
      scene
    );
    lampStem.position.set(deskLampX, deskLampY + 0.12, deskLampZ - 0.02);
    lampStem.rotation.x = -Math.PI / 10;
    lampStem.material = metalMat;

    // Conical shade pointing downwards onto circuit area
    const lampShade = MeshBuilder.CreateCylinder(
      "deskLightBody",
      { height: 0.065, diameterTop: 0.038, diameterBottom: 0.08 },
      scene
    );
    lampShade.position.set(deskLampX, deskLampY + 0.24, deskLampZ - 0.08);
    lampShade.rotation.x = Math.PI / 4;
    lampShade.material = metalMat;

    // Small glowing emitter sphere
    const lampBulb = MeshBuilder.CreateSphere(
      "lampBulbMesh",
      { diameter: 0.03 },
      scene
    );
    lampBulb.position.set(deskLampX, deskLampY + 0.22, deskLampZ - 0.09);
    const deskLampGlowMat = new StandardMaterial("deskLampGlowMat", scene);
    deskLampGlowMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    deskLampGlowMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    lampBulb.material = deskLampGlowMat;
    deskLampGlowMatRef.current = deskLampGlowMat;

    // PointLight focused onto worktable components
    const pointLightDesk = new PointLight(
      "pointLightDesk",
      new Vector3(deskLampX, deskLampY + 0.2, deskLampZ - 0.1),
      scene
    );
    pointLightDesk.range = 2.0;
    pointLightDesk.intensity = 0;
    pointLightDeskRef.current = pointLightDesk;

    // --- 4. AIR CONDITIONER (AC) SPLIT UNIT ON THE RIGHT ---
    const acX = 0.55;
    const acY = 1.5;
    const acZ = 2.44;

    // AC Main Cabinet Chassis
    const acCabinet = MeshBuilder.CreateBox(
      "acChassis",
      { width: 0.54, height: 0.17, depth: 0.13 },
      scene
    );
    acCabinet.position.set(acX, acY, acZ - 0.065);
    const acMat = new StandardMaterial("acMat", scene);
    acMat.diffuseColor = new Color3(0.95, 0.95, 0.95); // Glossy modern white
    acMat.specularColor = new Color3(0.5, 0.5, 0.5);
    acMat.roughness = 0.1;
    acCabinet.material = acMat;
    acCabinet.receiveShadows = true;

    // AC Front Intake Grill
    const acGrill = MeshBuilder.CreateBox(
      "acGrill",
      { width: 0.48, height: 0.04, depth: 0.004 },
      scene
    );
    acGrill.position.set(acX, acY + 0.05, acZ - 0.131);
    const grillMat = new StandardMaterial("grillMat", scene);
    grillMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
    acGrill.material = grillMat;

    // AC Air Louver Swing Flap
    const acFlap = MeshBuilder.CreateBox(
      "acFlap",
      { width: 0.48, height: 0.015, depth: 0.06 },
      scene
    );
    acFlap.position.set(acX, acY - 0.084, acZ - 0.08);
    acFlap.rotation.x = Math.PI / 12;
    const flapMat = new StandardMaterial("flapMat", scene);
    flapMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
    acFlap.material = flapMat;

    // AC LED display on bottom right
    const acDisplay = MeshBuilder.CreateBox(
      "acDisplay",
      { width: 0.06, height: 0.024, depth: 0.002 },
      scene
    );
    acDisplay.position.set(acX + 0.18, acY - 0.03, acZ - 0.131);
    const displayBackgroundMat = new StandardMaterial("displayBackgroundMat", scene);
    displayBackgroundMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
    acDisplay.material = displayBackgroundMat;

    // Glowing segment LED inside display
    const acDisplayLED = MeshBuilder.CreateBox(
      "acDisplayLED",
      { width: 0.02, height: 0.012, depth: 0.004 },
      scene
    );
    acDisplayLED.position.set(acX + 0.18, acY - 0.03, acZ - 0.132);
    const acDisplayLEDMat = new StandardMaterial("acDisplayLEDMat", scene);
    acDisplayLEDMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    acDisplayLEDMat.emissiveColor = new Color3(0.0, 0.0, 0.0);
    acDisplayLED.material = acDisplayLEDMat;
    acDisplayLEDMatRef.current = acDisplayLEDMat;

    // COOLING AIR BREEZE FLOW MESH
    const acBreeze = MeshBuilder.CreateBox(
      "acBreeze",
      { width: 0.46, height: 0.005, depth: 0.35 },
      scene
    );
    acBreeze.position.set(acX, acY - 0.22, acZ - 0.2);
    acBreeze.rotation.x = Math.PI / 5; // blowing down-forward
    const breezeMat = new StandardMaterial("breezeMat", scene);
    breezeMat.diffuseColor = new Color3(0.3, 0.6, 0.95);
    breezeMat.emissiveColor = new Color3(0.15, 0.45, 0.85); // ice blue glow
    breezeMat.alpha = 0.0;
    acBreeze.material = breezeMat;
    acBreezeMeshRef.current = acBreeze;

    // ================= WIRES AND JUMPER CONNECTIONS =================

    // 1. ESP32 to Relay logic jumpers (Thin control lines)
    // GPIO 5, 18, 19, 21 mapped to Relays 1, 2, 3, 4
    const espJumpers = [
      { start: new Vector3(-0.38, 0.83, -0.21), end: new Vector3(-0.19, 0.825, -0.07), color: new Color3(0.9, 0.1, 0.1) }, // R1 - Red
      { start: new Vector3(-0.38, 0.83, -0.17), end: new Vector3(-0.13, 0.825, -0.07), color: new Color3(0.1, 0.5, 0.9) }, // R2 - Blue
      { start: new Vector3(-0.38, 0.83, -0.13), end: new Vector3(-0.07, 0.825, -0.07), color: new Color3(0.9, 0.8, 0.1) }, // R3 - Yellow
      { start: new Vector3(-0.38, 0.83, -0.09), end: new Vector3(-0.01, 0.825, -0.07), color: new Color3(0.1, 0.8, 0.3) }, // R4 - Green
    ];

    espJumpers.forEach((wire, i) => {
      const mid = new Vector3((wire.start.x + wire.end.x) / 2, 0.865, (wire.start.z + wire.end.z) / 2);
      
      const s1 = MeshBuilder.CreateCylinder(`wire1_${i}`, { height: wire.start.subtract(mid).length(), diameter: 0.0035 }, scene);
      s1.position = wire.start.add(mid).scale(0.5);
      s1.lookAt(wire.start);
      s1.rotation.x += Math.PI / 2;

      const s2 = MeshBuilder.CreateCylinder(`wire2_${i}`, { height: wire.end.subtract(mid).length(), diameter: 0.0035 }, scene);
      s2.position = wire.end.add(mid).scale(0.5);
      s2.lookAt(wire.end);
      s2.rotation.x += Math.PI / 2;

      const jumperMat = new StandardMaterial(`jumperMat_${i}`, scene);
      jumperMat.diffuseColor = wire.color;
      jumperMat.specularColor = new Color3(0.02, 0.02, 0.02);
      s1.material = jumperMat;
      s2.material = jumperMat;
    });

    // 2. Thick copper high voltage lines
    // R1 -> Wall Sconce, R2 -> Ceiling Dome, R3 -> Desk Lamp, R4 -> PZEM CT coil -> AC unit
    const copperPaths = [
      // Wire 1: Relay 1 Out -> Wall Lamp
      [
        new Vector3(-0.19, 0.825, -0.21),
        new Vector3(-0.25, 0.815, 0.05),
        new Vector3(sconceX, 0.815, 0.4),
        new Vector3(sconceX, sconceY - 0.15, sconceZ - 0.085),
      ],
      // Wire 2: Relay 2 Out -> Ceiling Lamp
      [
        new Vector3(-0.13, 0.825, -0.21),
        new Vector3(-0.1, 0.815, 0.12),
        new Vector3(ceilingX, 0.815, 0.45),
        new Vector3(ceilingX, ceilingY - 0.1, ceilingZ - 0.05),
      ],
      // Wire 3: Relay 3 Out -> Desk Lamp
      [
        new Vector3(-0.07, 0.825, -0.21),
        new Vector3(-0.06, 0.815, 0.08),
        new Vector3(deskLampX, deskLampY + 0.01, deskLampZ),
      ],
      // Wire 4: Relay 4 Out -> PASSES EXACTLY THROUGH CT COIL TORUS -> Wall AC
      [
        new Vector3(-0.01, 0.825, -0.21),
        new Vector3(0.04, 0.81, -0.1),
        new Vector3(0.22, 0.84, -0.02), // CT COIL CENTER
        new Vector3(0.22, 0.82, 0.12),
        new Vector3(acX, 0.815, 0.5),
        new Vector3(acX, acY - 0.12, acZ - 0.065),
      ],
    ];

    const thickWireMat = new StandardMaterial("thickWireMat", scene);
    thickWireMat.diffuseColor = new Color3(0.08, 0.08, 0.08); // heavy black insulating sleeve
    thickWireMat.specularColor = new Color3(0.1, 0.1, 0.1);

    copperPaths.forEach((pathPoints, wireIdx) => {
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];
        const dist = p1.subtract(p2).length();

        const wireCyl = MeshBuilder.CreateCylinder(
          `copper_${wireIdx}_${i}`,
          { height: dist, diameter: 0.0075 },
          scene
        );
        wireCyl.position = p1.add(p2).scale(0.5);
        wireCyl.lookAt(p1);
        wireCyl.rotation.x += Math.PI / 2;
        wireCyl.material = thickWireMat;
      }
    });

    // ================= INTERACTION LISTENER =================
    // Clicking on lamps, AC, or relay cubes toggles their state
    scene.onPointerDown = (evt, pickResult) => {
      if (pickResult.hit && pickResult.pickedMesh && onChannelClick) {
        const name = pickResult.pickedMesh.name;

        if (name.startsWith("wallLight") || name.startsWith("sconce")) {
          onChannelClick(1); // Toggle Wall Light
        } else if (name.startsWith("ceilingDome") || name.startsWith("ceilingRecess")) {
          onChannelClick(2); // Toggle Ceiling Light
        } else if (name.startsWith("deskLight") || name.startsWith("lamp") || name.startsWith("lampBulb")) {
          onChannelClick(3); // Toggle Desk Lamp
        } else if (name.startsWith("ac")) {
          onChannelClick(4); // Toggle AC
        } else if (name.startsWith("relayCube_")) {
          const idx = parseInt(name.split("_")[1], 10);
          onChannelClick(idx + 1); // 1-indexed
        }
      }
    };

    // Run Engine Render loop
    engine.runRenderLoop(() => {
      scene.render();
    });

    setLoading(false);

    // Dynamic resize handler
    const resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      scene.dispose();
      engine.dispose();
    };
  }, []);

  // Update dynamic properties when React state changes
  useEffect(() => {
    if (!sceneRef.current) return;

    // 1. Room Ambient daylight intensity
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = state.ambientLight / 100;
    }

    // 2. Pulse the blue ESP32 Status LED slightly to show WiFi activity
    if (espStatusLEDRef.current) {
      const isPulse = Math.sin(Date.now() / 120) > 0.45;
      const blueMat = espStatusLEDRef.current.material as StandardMaterial;
      if (blueMat) {
        blueMat.emissiveColor = isPulse ? new Color3(0.1, 0.45, 0.95) : new Color3(0.01, 0.05, 0.15);
      }
    }

    // 3. PZEM-004T Serial TX Blinking LED
    // Blinks rapidly if active power is being consumed
    if (pzemTXLEDRef.current) {
      const isLoadOn = state.channels.some(ch => ch.isOn);
      // Faster blink if AC is ON
      const acOn = state.channels[3].isOn;
      const rate = acOn ? 100 : 250;
      const blink = isLoadOn && (Math.floor(Date.now() / rate) % 2 === 0);
      
      const txMat = pzemTXLEDRef.current.material as StandardMaterial;
      if (txMat) {
        if (blink) {
          txMat.diffuseColor = new Color3(0.95, 0.1, 0.1);
          txMat.emissiveColor = new Color3(0.85, 0.1, 0.1);
        } else {
          txMat.diffuseColor = new Color3(0.18, 0.02, 0.02);
          txMat.emissiveColor = new Color3(0.02, 0.0, 0.0);
        }
      }
    }

    // 4. Relay Status LEDs & Lights Updates
    const nextOnColors = state.channels.map(ch => hexToColor3(ch.color));

    state.channels.forEach((ch, idx) => {
      const relayLED = relayLEDsRef.current[idx];
      if (relayLED) {
        relayLED.material = ch.isOn ? ledOnMatRef.current : ledOffMatRef.current;
      }
    });

    // --- Channel 1: Sconce Lamp (Wall) ---
    const ch1 = state.channels[0];
    const col1 = nextOnColors[0];
    if (sconceGlowUpMatRef.current && sconceGlowDownMatRef.current) {
      if (ch1.isOn) {
        sconceGlowUpMatRef.current.emissiveColor = col1;
        sconceGlowUpMatRef.current.diffuseColor = col1;
        sconceGlowDownMatRef.current.emissiveColor = col1;
        sconceGlowDownMatRef.current.diffuseColor = col1;
      } else {
        sconceGlowUpMatRef.current.emissiveColor = new Color3(0.05, 0.05, 0.05);
        sconceGlowUpMatRef.current.diffuseColor = new Color3(0.3, 0.3, 0.3);
        sconceGlowDownMatRef.current.emissiveColor = new Color3(0.05, 0.05, 0.05);
        sconceGlowDownMatRef.current.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    }
    if (spotLightUpRef.current && spotLightDownRef.current && pointLightSconceRef.current) {
      const intensity = ch1.isOn ? 3.0 : 0;
      spotLightUpRef.current.intensity = intensity;
      spotLightUpRef.current.diffuse = col1;
      spotLightDownRef.current.intensity = intensity;
      spotLightDownRef.current.diffuse = col1;
      pointLightSconceRef.current.intensity = ch1.isOn ? 1.2 : 0;
      pointLightSconceRef.current.diffuse = col1;
    }

    // --- Channel 2: Ceiling Dome Lamp ---
    const ch2 = state.channels[1];
    const col2 = nextOnColors[1];
    if (ceilingGlowMatRef.current) {
      if (ch2.isOn) {
        ceilingGlowMatRef.current.emissiveColor = col2;
        ceilingGlowMatRef.current.diffuseColor = col2;
      } else {
        ceilingGlowMatRef.current.emissiveColor = new Color3(0.05, 0.05, 0.05);
        ceilingGlowMatRef.current.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    }
    if (pointLightCeilingRef.current) {
      pointLightCeilingRef.current.intensity = ch2.isOn ? 3.5 : 0;
      pointLightCeilingRef.current.diffuse = col2;
    }

    // --- Channel 3: Desk Lamp ---
    const ch3 = state.channels[2];
    const col3 = nextOnColors[2];
    if (deskLampGlowMatRef.current) {
      if (ch3.isOn) {
        deskLampGlowMatRef.current.emissiveColor = col3;
        deskLampGlowMatRef.current.diffuseColor = col3;
      } else {
        deskLampGlowMatRef.current.emissiveColor = new Color3(0.05, 0.05, 0.05);
        deskLampGlowMatRef.current.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    }
    if (pointLightDeskRef.current) {
      pointLightDeskRef.current.intensity = ch3.isOn ? 2.2 : 0;
      pointLightDeskRef.current.diffuse = col3;
    }

    // --- Channel 4: AC Unit ---
    const ch4 = state.channels[3];
    if (acDisplayLEDMatRef.current) {
      if (ch4.isOn) {
        acDisplayLEDMatRef.current.diffuseColor = new Color3(0.1, 0.9, 0.2); // glowing green screen
        acDisplayLEDMatRef.current.emissiveColor = new Color3(0.05, 0.8, 0.1);
      } else {
        acDisplayLEDMatRef.current.diffuseColor = new Color3(0.1, 0.1, 0.1);
        acDisplayLEDMatRef.current.emissiveColor = new Color3(0.0, 0.0, 0.0);
      }
    }

    // AC Cool Air Flow Breeze animation
    if (acBreezeMeshRef.current) {
      const breezeMat = acBreezeMeshRef.current.material as StandardMaterial;
      if (breezeMat) {
        if (ch4.isOn && state.acCompressorState === "Running") {
          breezeMat.alpha = 0.15 + Math.sin(Date.now() / 220) * 0.05;
        } else if (ch4.isOn && state.acCompressorState === "Starting") {
          breezeMat.alpha = 0.06 + Math.sin(Date.now() / 400) * 0.02;
        } else {
          breezeMat.alpha = 0.0;
        }
      }
    }

  }, [state, state.channels, state.ambientLight, state.acCompressorState]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[320px] md:h-[480px] glass rounded-3xl overflow-hidden shadow-2xl transition-all duration-300"
      id="simulator-container"
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block focus:outline-none cursor-grab active:cursor-grabbing"
        id="babylon-canvas"
      />

      {/* Up-time overlaid indicator */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10 pointer-events-none">
        <div className="glass px-3.5 py-2 rounded-xl flex items-center gap-2 pointer-events-auto shadow-lg">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
          </span>
          <span className="text-xs font-medium text-slate-300 font-mono">
            Uptime: {Math.floor(state.uptime / 60)}m {state.uptime % 60}s
          </span>
        </div>
      </div>

      <div className="absolute top-4 right-4 flex gap-2 z-10">
        <button
          onClick={resetCamera}
          className="p-2 bg-slate-900/90 border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-300 rounded-xl backdrop-blur-md transition-all shadow-lg flex items-center justify-center"
          title="Reset Sudut Pandang"
          id="reset-camera-btn"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {showHelperText && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto z-10 pointer-events-none">
          <div className="glass px-4 py-2.5 rounded-xl flex items-center justify-between gap-4 shadow-lg pointer-events-auto">
            <div className="flex items-center gap-2 text-slate-300 text-xs">
              <HelpCircle size={14} className="text-blue-400 shrink-0" />
              <span>Rotasi mouse: Geser sirkuit • Klik Relay, Lampu, atau AC untuk ON/OFF</span>
            </div>
            <button
              onClick={() => setShowHelperText(false)}
              className="text-slate-400 hover:text-slate-200 text-[10px] uppercase font-bold tracking-wider hover:bg-slate-800 px-1.5 py-0.5 rounded"
            >
              Ok
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-[#0f172a] flex flex-col items-center justify-center gap-3 z-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          <span className="text-slate-400 text-sm font-medium font-display animate-pulse">
            Merakit Simulasi 3D ESP32 & PZEM-004T...
          </span>
        </div>
      )}
    </div>
  );
}
