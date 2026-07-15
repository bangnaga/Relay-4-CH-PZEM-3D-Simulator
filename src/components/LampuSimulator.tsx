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
  TransformNode,
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
  // Channel 1: Lampu Dinding (4 Sisi)
  const sconceGlowUpMatsRef = useRef<StandardMaterial[]>([]);
  const sconceGlowDownMatsRef = useRef<StandardMaterial[]>([]);
  const spotLightUpsRef = useRef<SpotLight[]>([]);
  const spotLightDownsRef = useRef<SpotLight[]>([]);
  const pointLightSconcesRef = useRef<PointLight[]>([]);

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
        camera.setTarget(new Vector3(0, 1.05, 1.1));
        camera.alpha = -Math.PI / 2; // Front-center look
        camera.beta = Math.PI / 3.4; // Slightly higher slant looking down
        camera.radius = 2.4;
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

    // Automatically set maxSimultaneousLights to 16 for all standard materials
    scene.onNewMaterialAddedObservable.add((material) => {
      if (material instanceof StandardMaterial) {
        material.maxSimultaneousLights = 16;
      }
    });

    // 3. Setup Camera (tuned precisely)
    const camera = new ArcRotateCamera(
      "mainCamera",
      -Math.PI / 2,
      Math.PI / 3.4,
      2.4,
      new Vector3(0, 1.05, 1.1),
      scene
    );
    camera.attachControl(canvasRef.current, true);
    camera.lowerRadiusLimit = 1.25;
    camera.upperRadiusLimit = 4.0;
    camera.lowerBetaLimit = 0.1;
    camera.upperBetaLimit = Math.PI / 2.15; // Prevent going underneath desk

    // 4. Glow Layer for photorealistic glows on LEDs and sconces
    const glow = new GlowLayer("glow", scene);
    glow.intensity = 0.55;

    // 5. Setup Ambient Light (Room Ambient Slider Simulation)
    const ambientLight = new HemisphericLight(
      "ambientLight",
      new Vector3(0, 1, 0),
      scene
    );
    ambientLight.intensity = (state.ambientLight / 100) * 0.6;
    ambientLight.diffuse = new Color3(0.4, 0.45, 0.55); // soft, modern natural daylight/ambient
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
    tableMat.diffuseColor = new Color3(0.52, 0.34, 0.22); // Warm natural walnut wood
    tableMat.specularColor = new Color3(0.12, 0.1, 0.08);
    tableMat.roughness = 0.45;

    // --- Ground/Floor (Parquet Wood - 3x2 Meter Room Dimension) ---
    const floor = MeshBuilder.CreatePlane("floor", { width: 3.0, height: 2.0 }, scene);
    floor.rotation.x = Math.PI / 2;
    floor.position.set(0, 0, 1.0); // centered at (0, 0, 1.0) so depth goes from 0 to 2.0
    const floorMat = new StandardMaterial("floorMat", scene);
    floorMat.diffuseColor = new Color3(0.72, 0.58, 0.44); // Warm parquet oak wood
    floorMat.specularColor = new Color3(0.05, 0.05, 0.05);
    floorMat.roughness = 0.55;
    floor.material = floorMat;
    floor.receiveShadows = true;

    // --- Back Wall (White Paint - 3.0m wide by 2.2m high) ---
    const backWall = MeshBuilder.CreatePlane("backWall", { width: 3.0, height: 2.2 }, scene);
    backWall.position.set(0, 1.1, 2.0); // flat at Z=2.0
    const wallMat = new StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new Color3(0.95, 0.95, 0.95); // White paint
    wallMat.specularColor = new Color3(0.05, 0.05, 0.05);
    wallMat.roughness = 0.85;
    backWall.material = wallMat;
    backWall.receiveShadows = true;

    // --- Left Wall (White Paint - 2.0m deep by 2.2m high) ---
    const leftWall = MeshBuilder.CreatePlane("leftWall", { width: 2.0, height: 2.2 }, scene);
    leftWall.rotation.y = Math.PI / 2; // Rotate to face inwards (+X)
    leftWall.position.set(-1.5, 1.1, 1.0);
    leftWall.material = wallMat;
    leftWall.receiveShadows = true;

    // --- Right Wall (White Paint - 2.0m deep by 2.2m high) ---
    const rightWall = MeshBuilder.CreatePlane("rightWall", { width: 2.0, height: 2.2 }, scene);
    rightWall.rotation.y = -Math.PI / 2; // Rotate to face inwards (-X)
    rightWall.position.set(1.5, 1.1, 1.0);
    rightWall.material = wallMat;
    rightWall.receiveShadows = true;

    // --- Ceiling / Plafon (White Paint - 3.0m wide by 2.0m deep) ---
    const ceiling = MeshBuilder.CreatePlane("ceiling", { width: 3.0, height: 2.0 }, scene);
    ceiling.rotation.x = -Math.PI / 2; // Rotate to face downwards (-Y)
    ceiling.position.set(0, 2.2, 1.0);
    ceiling.material = wallMat;
    ceiling.receiveShadows = true;

    // --- Desk/Table (Touch backwall at Z=2.0) ---
    const tableTop = MeshBuilder.CreateBox(
      "tableTop",
      { width: 1.3, height: 0.04, depth: 0.65 },
      scene
    );
    tableTop.position.set(0, 0.75, 1.675);
    tableTop.material = tableMat;
    tableTop.receiveShadows = true;

    // Desk metal support frame under-apron
    const deskApron = MeshBuilder.CreateBox(
      "deskApron",
      { width: 1.26, height: 0.03, depth: 0.61 },
      scene
    );
    deskApron.position.set(0, 0.715, 1.675);
    const darkMetalMat = new StandardMaterial("darkMetalMat", scene);
    darkMetalMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
    darkMetalMat.roughness = 0.5;
    deskApron.material = darkMetalMat;

    // Table legs (Black steel)
    const legCoords = [
      [-0.58, 1.45],
      [0.58, 1.45],
      [-0.58, 1.90],
      [0.58, 1.90],
    ];
    const legMat = new StandardMaterial("legMat", scene);
    legMat.diffuseColor = new Color3(0.04, 0.04, 0.04); // Matte black steel
    legCoords.forEach(([x, z], i) => {
      const leg = MeshBuilder.CreateCylinder(
        `leg_${i}`,
        { height: 0.75, diameter: 0.04 },
        scene
      );
      leg.position.set(x, 0.375, z);
      leg.material = legMat;
    });

    // ================= PREMIUM DESK ACCESSORIES & ORGANIZER =================
    // Felt Workspace Desk Mat / Mousepad
    const deskMat = MeshBuilder.CreateBox(
      "deskMat",
      { width: 0.85, height: 0.003, depth: 0.36 },
      scene
    );
    deskMat.position.set(0, 0.7715, 1.62);
    const deskMatMat = new StandardMaterial("deskMatMat", scene);
    deskMatMat.diffuseColor = new Color3(0.12, 0.12, 0.14); // Sleek charcoal wool felt
    deskMatMat.roughness = 0.9;
    deskMat.material = deskMatMat;
    deskMat.receiveShadows = true;

    // Nice Ceramic Coffee Mug
    const coffeeCup = MeshBuilder.CreateCylinder(
      "coffeeCup",
      { height: 0.065, diameter: 0.045 },
      scene
    );
    coffeeCup.position.set(-0.48, 0.802, 1.5);
    const cupMat = new StandardMaterial("cupMat", scene);
    cupMat.diffuseColor = new Color3(0.95, 0.95, 0.95); // Glossy white ceramic
    cupMat.specularColor = new Color3(0.8, 0.8, 0.8);
    cupMat.roughness = 0.05;
    coffeeCup.material = cupMat;

    const cupHandle = MeshBuilder.CreateTorus(
      "cupHandle",
      { diameter: 0.026, thickness: 0.006, tessellation: 12 },
      scene
    );
    cupHandle.position.set(-0.505, 0.802, 1.5);
    cupHandle.rotation.x = Math.PI / 2;
    cupHandle.material = cupMat;

    // Stack of Multi-Colored Textbooks
    // Book 1 (Bottom, Red cover)
    const book1 = MeshBuilder.CreateBox(
      "book1",
      { width: 0.16, height: 0.022, depth: 0.22 },
      scene
    );
    book1.position.set(0.44, 0.801, 1.5);
    book1.rotation.y = -Math.PI / 15; // Slightly askew
    const book1Mat = new StandardMaterial("book1Mat", scene);
    book1Mat.diffuseColor = new Color3(0.68, 0.12, 0.12); // Rich crimson
    book1.material = book1Mat;

    // Book 2 (Top, Teal cover)
    const book2 = MeshBuilder.CreateBox(
      "book2",
      { width: 0.15, height: 0.02, depth: 0.2 },
      scene
    );
    book2.position.set(0.43, 0.822, 1.49);
    book2.rotation.y = Math.PI / 24;
    const book2Mat = new StandardMaterial("book2Mat", scene);
    book2Mat.diffuseColor = new Color3(0.08, 0.42, 0.46); // Technical Teal
    book2.material = book2Mat;

    // Pages edge for books
    const pages1 = MeshBuilder.CreateBox("pages1", { width: 0.154, height: 0.018, depth: 0.214 }, scene);
    pages1.position.set(0.44, 0.801, 1.5);
    pages1.rotation.y = -Math.PI / 15;
    const pagesMat = new StandardMaterial("pagesMat", scene);
    pagesMat.diffuseColor = new Color3(0.92, 0.92, 0.88); // Soft paper white
    pages1.material = pagesMat;

    const pages2 = MeshBuilder.CreateBox("pages2", { width: 0.144, height: 0.016, depth: 0.194 }, scene);
    pages2.position.set(0.43, 0.822, 1.49);
    pages2.rotation.y = Math.PI / 24;
    pages2.material = pagesMat;

    // ================= SUPPORTING STUDY ROOM FURNITURE =================

    // 1. Study Ergonomic Chair
    const chairX = 0;
    const chairY = 0;
    const chairZ = 1.1; // Placed perfectly in front of desk

    const chairSeatMat = new StandardMaterial("chairSeatMat", scene);
    chairSeatMat.diffuseColor = new Color3(0.15, 0.15, 0.18); // Dark charcoal fabric
    chairSeatMat.roughness = 0.8;

    const chairFrameMat = new StandardMaterial("chairFrameMat", scene);
    chairFrameMat.diffuseColor = new Color3(0.05, 0.05, 0.05); // Matte black frame
    chairFrameMat.roughness = 0.5;

    // Seat
    const seat = MeshBuilder.CreateBox("chairSeat", { width: 0.4, height: 0.04, depth: 0.38 }, scene);
    seat.position.set(chairX, 0.44, chairZ);
    seat.material = chairSeatMat;

    // Backrest
    const backrest = MeshBuilder.CreateBox("chairBack", { width: 0.38, height: 0.34, depth: 0.04 }, scene);
    backrest.position.set(chairX, 0.73, chairZ - 0.17);
    backrest.material = chairSeatMat;

    // Spine connector
    const spine = MeshBuilder.CreateBox("chairSpine", { width: 0.05, height: 0.32, depth: 0.03 }, scene);
    spine.position.set(chairX, 0.53, chairZ - 0.15);
    spine.material = chairFrameMat;

    // Base shaft
    const shaft = MeshBuilder.CreateCylinder("chairShaft", { height: 0.4, diameter: 0.03 }, scene);
    shaft.position.set(chairX, 0.2, chairZ);
    shaft.material = chairFrameMat;

    // 5-star legs at floor
    const starBase = MeshBuilder.CreateCylinder("chairStar", { height: 0.02, diameter: 0.44 }, scene);
    starBase.position.set(chairX, 0.015, chairZ);
    starBase.material = chairFrameMat;

    // 2. Walnut Wood Side Bookshelf/Cabinet
    const cabX = 0.8;
    const cabY = 0;
    const cabZ = 1.7;

    const cabMat = new StandardMaterial("cabMat", scene);
    cabMat.diffuseColor = new Color3(0.42, 0.3, 0.22); // Walnut wood
    cabMat.roughness = 0.6;

    const cabBody = MeshBuilder.CreateBox("cabBody", { width: 0.35, height: 0.85, depth: 0.35 }, scene);
    cabBody.position.set(cabX, 0.425, cabZ);
    cabBody.material = cabMat;

    const trimMat = new StandardMaterial("trimMat", scene);
    trimMat.diffuseColor = new Color3(0.1, 0.1, 0.1);

    // Drawers & handles
    for (let i = 0; i < 2; i++) {
      const drawerLine = MeshBuilder.CreateBox(`cabDrawer_${i}`, { width: 0.31, height: 0.005, depth: 0.01 }, scene);
      drawerLine.position.set(cabX, 0.22 + i * 0.35, cabZ - 0.176);
      drawerLine.material = trimMat;

      const handle = MeshBuilder.CreateBox(`cabHandle_${i}`, { width: 0.09, height: 0.015, depth: 0.015 }, scene);
      handle.position.set(cabX, 0.28 + i * 0.35, cabZ - 0.182);
      handle.material = metalMat;
    }

    // 3. Colorful Stacked Study Textbooks
    const bookX = 0.45;
    const bookY = 0.77;
    const bookZ = 1.65;

    const bookColors = [
      new Color3(0.12, 0.45, 0.8), // Blue book
      new Color3(0.85, 0.22, 0.15), // Red book
      new Color3(0.15, 0.62, 0.35), // Green book
    ];

    bookColors.forEach((color, idx) => {
      const book = MeshBuilder.CreateBox(`studyBook_${idx}`, { width: 0.20, height: 0.02, depth: 0.24 }, scene);
      book.position.set(bookX + idx * 0.01, bookY + 0.01 + idx * 0.021, bookZ + idx * 0.003);
      book.rotation.y = idx * 0.12 - 0.12;
      
      const bookMat = new StandardMaterial(`bookMat_${idx}`, scene);
      bookMat.diffuseColor = color;
      bookMat.roughness = 0.7;
      book.material = bookMat;

      const pages = MeshBuilder.CreateBox(`studyBookPages_${idx}`, { width: 0.19, height: 0.018, depth: 0.235 }, scene);
      pages.position.set(bookX + idx * 0.01, bookY + 0.01 + idx * 0.021, bookZ + idx * 0.003 + 0.006);
      pages.rotation.y = idx * 0.12 - 0.12;
      const pagesMat = new StandardMaterial("pagesMat", scene);
      pagesMat.diffuseColor = new Color3(0.95, 0.95, 0.9);
      pages.material = pagesMat;
    });

    // ================= LAPTOP OPENING ARDUINO IDE =================
    const laptopBase = MeshBuilder.CreateBox(
      "laptopBase",
      { width: 0.32, height: 0.012, depth: 0.22 },
      scene
    );
    laptopBase.position.set(0, 0.77 + 0.006, 1.55);
    const laptopMetalMat = new StandardMaterial("laptopMetalMat", scene);
    laptopMetalMat.diffuseColor = new Color3(0.25, 0.27, 0.3);
    laptopMetalMat.specularColor = new Color3(0.6, 0.6, 0.6);
    laptopMetalMat.roughness = 0.2;
    laptopBase.material = laptopMetalMat;

    const keyboardMat = new StandardMaterial("keyboardMat", scene);
    keyboardMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    const laptopKb = MeshBuilder.CreateBox(
      "laptopKb",
      { width: 0.29, height: 0.002, depth: 0.11 },
      scene
    );
    laptopKb.position.set(0, 0.77 + 0.013, 1.52);
    laptopKb.material = keyboardMat;

    // Trackpad
    const trackpad = MeshBuilder.CreateBox(
      "trackpad",
      { width: 0.08, height: 0.001, depth: 0.05 },
      scene
    );
    trackpad.position.set(0, 0.77 + 0.013, 1.59);
    trackpad.material = laptopMetalMat;

    // Screen Lid (Tilted back at ~20 degrees)
    const screenY = 0.77 + 0.11;
    const screenZ = 1.65;
    const laptopScreen = MeshBuilder.CreateBox(
      "laptopScreen",
      { width: 0.32, height: 0.21, depth: 0.01 },
      scene
    );
    laptopScreen.rotation.x = -Math.PI / 10;
    laptopScreen.position.set(0, screenY, screenZ);
    laptopScreen.material = laptopMetalMat;

    // Screen display showing Arduino IDE
    const screenDisplay = MeshBuilder.CreateBox(
      "screenDisplay",
      { width: 0.30, height: 0.19, depth: 0.004 },
      scene
    );
    screenDisplay.rotation.x = -Math.PI / 10;
    screenDisplay.position.set(0, screenY, screenZ - 0.005);
    
    const displayMat = new StandardMaterial("displayMat", scene);
    displayMat.diffuseColor = new Color3(0.04, 0.08, 0.1); // Arduino IDE Dark Mode Teal
    displayMat.emissiveColor = new Color3(0.02, 0.04, 0.05);
    screenDisplay.material = displayMat;

    // Syntax-highlighted code lines on display screen (C++ format)
    const syntaxColors = [
      new Color3(0.12, 0.65, 0.45), // comments (green)
      new Color3(0.85, 0.42, 0.15), // setup/loop (orange)
      new Color3(0.15, 0.55, 0.85), // pin / mode (blue)
      new Color3(0.95, 0.95, 0.95), // regular code (white)
      new Color3(0.85, 0.42, 0.15), // digital write (orange)
      new Color3(0.12, 0.65, 0.45), // comment (green)
    ];

    const cosTheta = Math.cos(Math.PI / 10);
    const sinTheta = Math.sin(Math.PI / 10);

    syntaxColors.forEach((col, idx) => {
      const codeLine = MeshBuilder.CreateBox(
        `codeLine_${idx}`,
        { width: 0.14 + Math.random() * 0.1, height: 0.008, depth: 0.002 },
        scene
      );
      codeLine.rotation.x = -Math.PI / 10;
      const yOffset = 0.07 - idx * 0.025;
      codeLine.position.set(
        -0.05 + Math.random() * 0.02,
        screenY + yOffset * cosTheta,
        screenZ - 0.006 - yOffset * sinTheta
      );
      
      const lineMat = new StandardMaterial(`lineMat_${idx}`, scene);
      lineMat.diffuseColor = col;
      lineMat.emissiveColor = col.scale(0.8);
      codeLine.material = lineMat;
    });

    // ================= WALL-MOUNTED INDUSTRIAL BOX PANEL =================
    const boxX = -0.22;
    const boxY = 1.25;
    const boxZ = 1.97;

    const panelBox = MeshBuilder.CreateBox(
      "panelBox",
      { width: 0.42, height: 0.52, depth: 0.08 },
      scene
    );
    panelBox.position.set(boxX, boxY, boxZ);
    const boxMetalMat = new StandardMaterial("boxMetalMat", scene);
    boxMetalMat.diffuseColor = new Color3(0.35, 0.38, 0.42); // Industrial grey paint
    boxMetalMat.roughness = 0.4;
    panelBox.material = boxMetalMat;

    // Base board (Prototyping Board plate mounted flat inside)
    const baseBoard = MeshBuilder.CreateBox(
      "baseBoard",
      { width: 0.38, height: 0.48, depth: 0.01 },
      scene
    );
    baseBoard.position.set(boxX, boxY, boxZ - 0.01);
    const baseBoardMat = new StandardMaterial("baseBoardMat", scene);
    baseBoardMat.diffuseColor = new Color3(0.28, 0.18, 0.12); // Rich mahogany
    baseBoardMat.specularColor = new Color3(0.04, 0.04, 0.04);
    baseBoardMat.roughness = 0.5;
    baseBoard.material = baseBoardMat;

    // Glass Cover Panel (Door)
    const panelCover = MeshBuilder.CreateBox(
      "panelCover",
      { width: 0.42, height: 0.52, depth: 0.006 },
      scene
    );
    panelCover.position.set(boxX, boxY, boxZ - 0.042);
    const coverMat = new StandardMaterial("coverMat", scene);
    coverMat.diffuseColor = new Color3(0.3, 0.4, 0.5);
    coverMat.alpha = 0.15;
    panelCover.material = coverMat;

    // ================= ESP32 BOARD MESH (Inside Box Panel) =================
    const espPCB = MeshBuilder.CreateBox(
      "espPCB",
      { width: 0.12, height: 0.18, depth: 0.008 },
      scene
    );
    espPCB.position.set(boxX - 0.09, boxY + 0.06, boxZ - 0.02);
    const espPCBMat = new StandardMaterial("espPCBMat", scene);
    espPCBMat.diffuseColor = new Color3(0.06, 0.15, 0.08); // Emerald solder mask
    espPCBMat.specularColor = new Color3(0.15, 0.15, 0.15);
    espPCB.material = espPCBMat;

    // WiFi Module Metal Shield
    const espShield = MeshBuilder.CreateBox(
      "espShield",
      { width: 0.05, height: 0.07, depth: 0.015 },
      scene
    );
    espShield.position.set(boxX - 0.09, boxY + 0.06, boxZ - 0.03);
    espShield.material = metalMat;

    // Black Pin Headers
    const headerLeft = MeshBuilder.CreateBox(
      "headerLeft",
      { width: 0.012, height: 0.15, depth: 0.015 },
      scene
    );
    headerLeft.position.set(boxX - 0.13, boxY + 0.06, boxZ - 0.025);
    const headerMat = new StandardMaterial("headerMat", scene);
    headerMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
    headerLeft.material = headerMat;

    const headerRight = MeshBuilder.CreateBox(
      "headerRight",
      { width: 0.012, height: 0.15, depth: 0.015 },
      scene
    );
    headerRight.position.set(boxX - 0.05, boxY + 0.06, boxZ - 0.025);
    headerRight.material = headerMat;

    // USB Port
    const usbPort = MeshBuilder.CreateBox(
      "usbPort",
      { width: 0.025, height: 0.015, depth: 0.02 },
      scene
    );
    usbPort.position.set(boxX - 0.09, boxY - 0.04, boxZ - 0.025);
    usbPort.material = metalMat;

    // Onboard LEDs
    const espPowerLED = MeshBuilder.CreateSphere("espPowerLED", { diameter: 0.008 }, scene);
    espPowerLED.position.set(boxX - 0.11, boxY + 0.13, boxZ - 0.026);
    espPowerLED.material = redLedOnMat;

    const espStatusLED = MeshBuilder.CreateSphere("espStatusLED", { diameter: 0.008 }, scene);
    espStatusLED.position.set(boxX - 0.07, boxY + 0.13, boxZ - 0.026);
    espStatusLED.material = blueLedOnMat;
    espStatusLEDRef.current = espStatusLED;

    // ================= 4-CHANNEL RELAY BOARD MESH (Inside Box Panel) =================
    const relayPCB = MeshBuilder.CreateBox(
      "relayPCB",
      { width: 0.16, height: 0.12, depth: 0.008 },
      scene
    );
    relayPCB.position.set(boxX + 0.08, boxY + 0.1, boxZ - 0.02);
    const relayPCBMat = new StandardMaterial("relayPCBMat", scene);
    relayPCBMat.diffuseColor = new Color3(0.05, 0.12, 0.24); // Industrial blue
    relayPCBMat.specularColor = new Color3(0.15, 0.15, 0.15);
    relayPCB.material = relayPCBMat;

    const relayBlueMat = new StandardMaterial("relayBlueMat", scene);
    relayBlueMat.diffuseColor = new Color3(0.02, 0.26, 0.55); // Blue Songle relays
    relayBlueMat.specularColor = new Color3(0.2, 0.2, 0.2);

    const greenTerminalMat = new StandardMaterial("greenTerminalMat", scene);
    greenTerminalMat.diffuseColor = new Color3(0.08, 0.44, 0.14); // Green blocks

    const relayCubes: Mesh[] = [];
    const relayLEDs: Mesh[] = [];

    // Construct 4 Relay Channels
    for (let i = 0; i < 4; i++) {
      const xOffset = -0.06 + i * 0.04;

      // Relay Cube
      const cube = MeshBuilder.CreateBox(
        `relayCube_${i}`,
        { width: 0.03, height: 0.03, depth: 0.032 },
        scene
      );
      cube.position.set(boxX + 0.08 + xOffset, boxY + 0.12, boxZ - 0.035);
      cube.material = relayBlueMat;
      relayCubes.push(cube);

      // Screw Terminal Block (3 pins per relay)
      const terminal = MeshBuilder.CreateBox(
        `relayTerm_${i}`,
        { width: 0.03, height: 0.025, depth: 0.025 },
        scene
      );
      terminal.position.set(boxX + 0.08 + xOffset, boxY + 0.07, boxZ - 0.03);
      terminal.material = greenTerminalMat;

      // Screw terminals indent
      const terminalsIndent = MeshBuilder.CreateBox(
        `termIndent_${i}`,
        { width: 0.024, height: 0.005, depth: 0.01 },
        scene
      );
      terminalsIndent.position.set(boxX + 0.08 + xOffset, boxY + 0.055, boxZ - 0.032);
      const screwMat = new StandardMaterial("screwMat", scene);
      screwMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
      terminalsIndent.material = screwMat;

      // Relay Status LED
      const led = MeshBuilder.CreateSphere(
        `relayLED_${i}`,
        { diameter: 0.007 },
        scene
      );
      led.position.set(boxX + 0.08 + xOffset, boxY + 0.145, boxZ - 0.026);
      led.material = ledOffMat;
      relayLEDs.push(led);
    }
    relayLEDsRef.current = relayLEDs;

    // ================= PZEM-004T SENSOR BOARD MESH (Inside Box Panel) =================
    const pzemPCB = MeshBuilder.CreateBox(
      "pzemPCB",
      { width: 0.14, height: 0.10, depth: 0.008 },
      scene
    );
    pzemPCB.position.set(boxX + 0.08, boxY - 0.1, boxZ - 0.02);
    const pzemPCBMat = new StandardMaterial("pzemPCBMat", scene);
    pzemPCBMat.diffuseColor = new Color3(0.04, 0.08, 0.16); // dark navy/teal PCB
    pzemPCB.material = pzemPCBMat;

    const chipMat = new StandardMaterial("chipMat", scene);
    chipMat.diffuseColor = new Color3(0.15, 0.15, 0.15);

    // Small black chip representing the V9881D chip inside PZEM
    const pzemChip = MeshBuilder.CreateBox(
      "pzemChip",
      { width: 0.025, height: 0.025, depth: 0.005 },
      scene
    );
    pzemChip.position.set(boxX + 0.06, boxY - 0.1, boxZ - 0.025);
    pzemChip.material = chipMat;

    // Optocoupler chips
    for (let i = 0; i < 3; i++) {
      const opto = MeshBuilder.CreateBox(
        `pzemOpto_${i}`,
        { width: 0.012, height: 0.018, depth: 0.005 },
        scene
      );
      opto.position.set(boxX + 0.04 + i * 0.018, boxY - 0.07, boxZ - 0.025);
      opto.material = chipMat;
    }

    // High Voltage Terminal Block
    const pzemHighTerm = MeshBuilder.CreateBox(
      "pzemHighTerm",
      { width: 0.04, height: 0.025, depth: 0.025 },
      scene
    );
    pzemHighTerm.position.set(boxX + 0.12, boxY - 0.12, boxZ - 0.03);
    pzemHighTerm.material = greenTerminalMat;

    // CT Coil wire terminal connector
    const pzemCtTerm = MeshBuilder.CreateBox(
      "pzemCtTerm",
      { width: 0.025, height: 0.02, depth: 0.02 },
      scene
    );
    pzemCtTerm.position.set(boxX + 0.04, boxY - 0.12, boxZ - 0.03);
    const ctTermMat = new StandardMaterial("ctTermMat", scene);
    ctTermMat.diffuseColor = new Color3(0.18, 0.18, 0.18);
    pzemCtTerm.material = ctTermMat;

    // PZEM-004T Status Telemetry LED
    const pzemTXLED = MeshBuilder.CreateSphere("pzemTXLED", { diameter: 0.008 }, scene);
    pzemTXLED.position.set(boxX + 0.12, boxY - 0.06, boxZ - 0.026);
    pzemTXLED.material = redLedOffMat;
    pzemTXLEDRef.current = pzemTXLED;

    // 3D CURRENT TRANSFORMER (CT) COIL TORUS (Mounted vertically inside box panel)
    const pzemCT = MeshBuilder.CreateTorus(
      "pzemCT",
      { diameter: 0.05, thickness: 0.015, tessellation: 20 },
      scene
    );
    pzemCT.position.set(boxX + 0.08, boxY - 0.19, boxZ - 0.025);
    const ctMat = new StandardMaterial("ctMat", scene);
    ctMat.diffuseColor = new Color3(0.08, 0.08, 0.08); // Matte black casing
    ctMat.roughness = 0.5;
    pzemCT.material = ctMat;

    // Blue wrapper coil tape on CT
    const ctWrapper = MeshBuilder.CreateBox(
      "ctWrapper",
      { width: 0.012, height: 0.018, depth: 0.02 },
      scene
    );
    ctWrapper.position.set(boxX + 0.08, boxY - 0.17, boxZ - 0.025);
    const wrapperMat = new StandardMaterial("wrapperMat", scene);
    wrapperMat.diffuseColor = new Color3(0.1, 0.35, 0.75); // Blue vinyl tape
    ctWrapper.material = wrapperMat;

    // ================= APPLIANCES MOUNTED IN STANDARD POSITIONS =================

    // --- 1. WALL SCONCES (LAMPU DINDING) - Cukup 1 Saja di Dinding Belakang ---
    sconceGlowUpMatsRef.current = [];
    sconceGlowDownMatsRef.current = [];
    spotLightUpsRef.current = [];
    spotLightDownsRef.current = [];
    pointLightSconcesRef.current = [];

    tableMat.maxSimultaneousLights = 16;
    floorMat.maxSimultaneousLights = 16;
    wallMat.maxSimultaneousLights = 16;

    const sconcesConfig = [
      { x: -0.65, y: 1.7, z: 1.98, rotY: 0 },          // Back wall left
    ];

    sconcesConfig.forEach((cfg, idx) => {
      // Plate
      const plate = MeshBuilder.CreateBox(`wallLightPlate_${idx}`, { width: 0.06, height: 0.06, depth: 0.01 }, scene);
      plate.material = goldMat;

      // Arm
      const arm = MeshBuilder.CreateCylinder(`wallLightArm_${idx}`, { height: 0.06, diameter: 0.012 }, scene);
      arm.rotation.x = Math.PI / 2;
      arm.material = goldMat;

      // Body
      const body = MeshBuilder.CreateCylinder(`wallLightBody_${idx}`, { height: 0.18, diameter: 0.045 }, scene);
      body.material = goldMat;

      // Glowing caps (up and down)
      const capUp = MeshBuilder.CreateCylinder(`wallLightCapUp_${idx}`, { height: 0.008, diameter: 0.042 }, scene);
      const gMatUp = new StandardMaterial(`sGlowUpMat_${idx}`, scene);
      gMatUp.diffuseColor = new Color3(0.5, 0.5, 0.5);
      gMatUp.emissiveColor = new Color3(0.05, 0.05, 0.05);
      capUp.material = gMatUp;
      sconceGlowUpMatsRef.current.push(gMatUp);

      const capDown = MeshBuilder.CreateCylinder(`wallLightCapDown_${idx}`, { height: 0.008, diameter: 0.042 }, scene);
      const gMatDown = new StandardMaterial(`sGlowDownMat_${idx}`, scene);
      gMatDown.diffuseColor = new Color3(0.5, 0.5, 0.5);
      gMatDown.emissiveColor = new Color3(0.05, 0.05, 0.05);
      capDown.material = gMatDown;
      sconceGlowDownMatsRef.current.push(gMatDown);

      // Parent transform node to easily align orientation
      const node = new TransformNode(`sconceNode_${idx}`, scene);
      node.position.set(cfg.x, cfg.y, cfg.z);
      node.rotation.y = cfg.rotY;

      plate.parent = node;
      arm.parent = node;
      body.parent = node;
      capUp.parent = node;
      capDown.parent = node;

      // Relative offsets in local space (facing negative Z direction inside node)
      plate.position.set(0, 0, -0.005);
      arm.position.set(0, 0, -0.035);
      body.position.set(0, 0, -0.065);
      capUp.position.set(0, 0.09, -0.065);
      capDown.position.set(0, -0.09, -0.065);

      // Setup pointlight relative to parent
      const localLightPos = new Vector3(0, -0.12, -0.08);
      const worldLightPos = Vector3.TransformCoordinates(localLightPos, node.getWorldMatrix());
      const pointLight = new PointLight(`pointLightSconce_${idx}`, worldLightPos, scene);
      pointLight.range = 2.0;
      pointLight.intensity = 0;
      pointLightSconcesRef.current.push(pointLight);

      // Setup spot light down
      const localSpotDownPos = new Vector3(0, -0.1, -0.065);
      const worldSpotDownPos = Vector3.TransformCoordinates(localSpotDownPos, node.getWorldMatrix());
      const localSpotDownDir = new Vector3(0, -1, -0.05);
      const worldSpotDownDir = Vector3.TransformNormal(localSpotDownDir, node.getWorldMatrix());
      const spotD = new SpotLight(`wallLightSpotDown_${idx}`, worldSpotDownPos, worldSpotDownDir, Math.PI / 2.8, 3, scene);
      spotD.range = 2.0;
      spotD.intensity = 0;
      spotLightDownsRef.current.push(spotD);

      // Setup spot light up
      const localSpotUpPos = new Vector3(0, 0.1, -0.065);
      const worldSpotUpPos = Vector3.TransformCoordinates(localSpotUpPos, node.getWorldMatrix());
      const localSpotUpDir = new Vector3(0, 1, -0.05);
      const worldSpotUpDir = Vector3.TransformNormal(localSpotUpDir, node.getWorldMatrix());
      const spotU = new SpotLight(`wallLightSpotUp_${idx}`, worldSpotUpPos, worldSpotUpDir, Math.PI / 2.8, 3, scene);
      spotU.range = 1.8;
      spotU.intensity = 0;
      spotLightUpsRef.current.push(spotU);
    });

    // --- 2. CEILING LED STRIP & HANGING CEILING LAMP (LAMPU UTAMA) ---
    const ledStripBack = MeshBuilder.CreateBox(
      "ceilingDome_back",
      { width: 3.0, height: 0.015, depth: 0.02 },
      scene
    );
    ledStripBack.position.set(0, 2.19, 2.0);
    
    const ledStripLeft = MeshBuilder.CreateBox(
      "ceilingDome_left",
      { width: 0.02, height: 0.015, depth: 2.0 },
      scene
    );
    ledStripLeft.position.set(-1.5, 2.19, 1.0);

    const ledStripRight = MeshBuilder.CreateBox(
      "ceilingDome_right",
      { width: 0.02, height: 0.015, depth: 2.0 },
      scene
    );
    ledStripRight.position.set(1.5, 2.19, 1.0);

    const ledStripFront = MeshBuilder.CreateBox(
      "ceilingDome_front",
      { width: 3.0, height: 0.015, depth: 0.02 },
      scene
    );
    ledStripFront.position.set(0, 2.19, 0.0);

    const ceilingGlowMat = new StandardMaterial("ceilingGlowMat", scene);
    ceilingGlowMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    ceilingGlowMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    
    ledStripBack.material = ceilingGlowMat;
    ledStripLeft.material = ceilingGlowMat;
    ledStripRight.material = ceilingGlowMat;
    ledStripFront.material = ceilingGlowMat;
    ceilingGlowMatRef.current = ceilingGlowMat;

    // --- 2b. HANGING CEILING LAMP (LAMPU UTAMA) ---
    // Cord hanging down from (0, 2.19, 1.0) to (0, 1.99, 1.0) (shorter, higher up)
    const hangingCord = MeshBuilder.CreateCylinder(
      "ceilingDome_cord",
      { height: 0.2, diameter: 0.006 },
      scene
    );
    hangingCord.position.set(0, 2.09, 1.0);
    const cordMat = new StandardMaterial("cordMat", scene);
    cordMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
    hangingCord.material = cordMat;

    // Modern dome shade matching wall lights - raised higher
    const hangingShade = MeshBuilder.CreateCylinder(
      "ceilingDome_shade",
      { height: 0.12, diameterTop: 0.04, diameterBottom: 0.22, tessellation: 24 },
      scene
    );
    hangingShade.position.set(0, 1.93, 1.0);
    hangingShade.material = goldMat;

    // Glowing pendant bulb - raised higher
    const hangingBulb = MeshBuilder.CreateSphere(
      "ceilingDome_bulb",
      { diameter: 0.08 },
      scene
    );
    hangingBulb.position.set(0, 1.88, 1.0);
    hangingBulb.material = ceilingGlowMat;

    // PointLight for Ceiling LED Strip & Pendant (Cast smooth, wide-range room ambient light - Adjusted to 5.0m range for natural coverage)
    const pointLightCeiling = new PointLight(
      "pointLightCeiling",
      new Vector3(0, 1.85, 1.0),
      scene
    );
    pointLightCeiling.range = 5.0;
    pointLightCeiling.intensity = 0;
    pointLightCeilingRef.current = pointLightCeiling;

    // --- 3. PREMIUM WIDE-SPREAD STUDY DESK LAMP (LAMPU BELAJAR PREMIUM) ---
    const deskLampX = -0.45;
    const deskLampY = 0.79; // Desk base top
    const deskLampZ = 1.5;

    // Heavy round base
    const lampBase = MeshBuilder.CreateCylinder(
      "lampBase",
      { height: 0.015, diameter: 0.085 },
      scene
    );
    lampBase.position.set(deskLampX, deskLampY + 0.0075, deskLampZ);
    lampBase.material = metalMat;

    // Lower armature stem (angled up and forward)
    const lampLowerStem = MeshBuilder.CreateCylinder(
      "lampLowerStem",
      { height: 0.22, diameter: 0.009 },
      scene
    );
    lampLowerStem.position.set(deskLampX, deskLampY + 0.11, deskLampZ);
    lampLowerStem.rotation.x = -Math.PI / 8;
    lampLowerStem.material = metalMat;

    // Brass articulative joint sphere
    const lampJoint = MeshBuilder.CreateSphere(
      "lampJoint",
      { diameter: 0.018 },
      scene
    );
    lampJoint.position.set(deskLampX, deskLampY + 0.21, deskLampZ - 0.08);
    lampJoint.material = goldMat;

    // Upper armature stem (angled further forward)
    const lampUpperStem = MeshBuilder.CreateCylinder(
      "lampUpperStem",
      { height: 0.22, diameter: 0.009 },
      scene
    );
    lampUpperStem.position.set(deskLampX, deskLampY + 0.3, deskLampZ - 0.15);
    lampUpperStem.rotation.x = -Math.PI / 4;
    lampUpperStem.material = metalMat;

    // Sleek wide horizontal bar lamp head (sebaran cahaya luas!)
    const lampShade = MeshBuilder.CreateBox(
      "deskLightBody",
      { width: 0.24, height: 0.018, depth: 0.05 },
      scene
    );
    lampShade.position.set(deskLampX + 0.08, deskLampY + 0.38, deskLampZ - 0.23);
    lampShade.rotation.z = Math.PI / 24; // slightly tilted for realism
    lampShade.rotation.x = Math.PI / 24;
    lampShade.material = metalMat;

    // Flat wide glowing LED panel under the bar shade
    const lampBulb = MeshBuilder.CreateBox(
      "lampBulbMesh",
      { width: 0.22, height: 0.005, depth: 0.045 },
      scene
    );
    lampBulb.position.set(deskLampX + 0.08, deskLampY + 0.37, deskLampZ - 0.23);
    lampBulb.rotation.z = Math.PI / 24;
    lampBulb.rotation.x = Math.PI / 24;
    const deskLampGlowMat = new StandardMaterial("deskLampGlowMat", scene);
    deskLampGlowMat.diffuseColor = new Color3(0.5, 0.5, 0.5);
    deskLampGlowMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
    lampBulb.material = deskLampGlowMat;
    deskLampGlowMatRef.current = deskLampGlowMat;

    // Natural point light positioned underneath the lamp head (range: 2.2m)
    const pointLightDesk = new PointLight(
      "pointLightDesk",
      new Vector3(deskLampX + 0.08, deskLampY + 0.34, deskLampZ - 0.23),
      scene
    );
    pointLightDesk.range = 2.2;
    pointLightDesk.intensity = 0;
    pointLightDeskRef.current = pointLightDesk;

    // --- 4. AIR CONDITIONER (AC) SPLIT UNIT HIGH ON BACK WALL RIGHT ---
    const acX = 0.55;
    const acY = 1.75;
    const acZ = 1.98;

    // AC Main Cabinet Chassis
    const acCabinet = MeshBuilder.CreateBox(
      "acChassis",
      { width: 0.48, height: 0.15, depth: 0.11 },
      scene
    );
    acCabinet.position.set(acX, acY, acZ - 0.055);
    const acMat = new StandardMaterial("acMat", scene);
    acMat.diffuseColor = new Color3(0.95, 0.95, 0.95); // Glossy modern white
    acMat.specularColor = new Color3(0.5, 0.5, 0.5);
    acMat.roughness = 0.1;
    acCabinet.material = acMat;
    acCabinet.receiveShadows = true;

    // AC Front Intake Grill
    const acGrill = MeshBuilder.CreateBox(
      "acGrill",
      { width: 0.42, height: 0.035, depth: 0.004 },
      scene
    );
    acGrill.position.set(acX, acY + 0.04, acZ - 0.111);
    const grillMat = new StandardMaterial("grillMat", scene);
    grillMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
    acGrill.material = grillMat;

    // AC Air Louver Swing Flap
    const acFlap = MeshBuilder.CreateBox(
      "acFlap",
      { width: 0.42, height: 0.012, depth: 0.05 },
      scene
    );
    acFlap.position.set(acX, acY - 0.074, acZ - 0.07);
    acFlap.rotation.x = Math.PI / 12;
    const flapMat = new StandardMaterial("flapMat", scene);
    flapMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
    acFlap.material = flapMat;

    // AC LED display on bottom right
    const acDisplay = MeshBuilder.CreateBox(
      "acDisplay",
      { width: 0.05, height: 0.02, depth: 0.002 },
      scene
    );
    acDisplay.position.set(acX + 0.15, acY - 0.025, acZ - 0.111);
    const displayBackgroundMat = new StandardMaterial("displayBackgroundMat", scene);
    displayBackgroundMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
    acDisplay.material = displayBackgroundMat;

    // Glowing segment LED inside display
    const acDisplayLED = MeshBuilder.CreateBox(
      "acDisplayLED",
      { width: 0.018, height: 0.01, depth: 0.004 },
      scene
    );
    acDisplayLED.position.set(acX + 0.15, acY - 0.025, acZ - 0.112);
    const acDisplayLEDMat = new StandardMaterial("acDisplayLEDMat", scene);
    acDisplayLEDMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
    acDisplayLEDMat.emissiveColor = new Color3(0.0, 0.0, 0.0);
    acDisplayLED.material = acDisplayLEDMat;
    acDisplayLEDMatRef.current = acDisplayLEDMat;

    // COOLING AIR BREEZE FLOW MESH
    const acBreeze = MeshBuilder.CreateBox(
      "acBreeze",
      { width: 0.4, height: 0.004, depth: 0.3 },
      scene
    );
    acBreeze.position.set(acX, acY - 0.2, acZ - 0.15);
    acBreeze.rotation.x = Math.PI / 5; // blowing down-forward
    const breezeMat = new StandardMaterial("breezeMat", scene);
    breezeMat.diffuseColor = new Color3(0.3, 0.6, 0.95);
    breezeMat.emissiveColor = new Color3(0.15, 0.45, 0.85); // ice blue glow
    breezeMat.alpha = 0.0;
    acBreeze.material = breezeMat;
    acBreezeMeshRef.current = acBreeze;

    // ================= WIRES AND JUMPER CONNECTIONS REMOVED AS REQUESTED =================

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
      const baseIntensity = (state.ambientLight / 100) * 0.4;
      const ch2 = state.channels[1];
      if (ch2.isOn) {
        // If ceiling lamp is ON, add a beautifully diffused, naturally tinted bounce light
        const col2 = hexToColor3(ch2.color);
        ambientLightRef.current.intensity = baseIntensity + 0.65; // Evenly distributed, bright ambient bounce
        // Blend daylight color with lamp color for natural realistic lighting
        ambientLightRef.current.diffuse = new Color3(
          0.2 + col2.r * 0.5,
          0.2 + col2.g * 0.5,
          0.22 + col2.b * 0.5
        );
        // Realistic light-colored warm floor bounce reflection tinted with the lamp's color
        ambientLightRef.current.groundColor = new Color3(
          0.16 + col2.r * 0.35,
          0.14 + col2.g * 0.3,
          0.11 + col2.b * 0.25
        );
      } else {
        // Just standard natural daylight
        ambientLightRef.current.intensity = baseIntensity;
        ambientLightRef.current.diffuse = new Color3(0.4, 0.45, 0.55); // soft daylight blue
        ambientLightRef.current.groundColor = new Color3(0.12, 0.12, 0.16);
      }
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
    sconceGlowUpMatsRef.current.forEach((mat) => {
      if (ch1.isOn) {
        mat.emissiveColor = col1.scale(0.35);
        mat.diffuseColor = col1;
      } else {
        mat.emissiveColor = new Color3(0.05, 0.05, 0.05);
        mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    });
    sconceGlowDownMatsRef.current.forEach((mat) => {
      if (ch1.isOn) {
        mat.emissiveColor = col1.scale(0.35);
        mat.diffuseColor = col1;
      } else {
        mat.emissiveColor = new Color3(0.05, 0.05, 0.05);
        mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    });

    const intensity = ch1.isOn ? 0.6 : 0;
    spotLightUpsRef.current.forEach((light) => {
      light.intensity = intensity;
      light.diffuse = col1;
    });
    spotLightDownsRef.current.forEach((light) => {
      light.intensity = intensity;
      light.diffuse = col1;
    });
    pointLightSconcesRef.current.forEach((light) => {
      light.intensity = ch1.isOn ? 0.15 : 0;
      light.diffuse = col1;
    });

    // --- Channel 2: Ceiling Dome Lamp ---
    const ch2 = state.channels[1];
    const col2 = nextOnColors[1];
    if (ceilingGlowMatRef.current) {
      if (ch2.isOn) {
        ceilingGlowMatRef.current.emissiveColor = col2.scale(0.85); // Bright glowing filament look
        ceilingGlowMatRef.current.diffuseColor = col2;
      } else {
        ceilingGlowMatRef.current.emissiveColor = new Color3(0.05, 0.05, 0.05);
        ceilingGlowMatRef.current.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    }
    if (pointLightCeilingRef.current) {
      pointLightCeilingRef.current.intensity = ch2.isOn ? 2.0 : 0; // Beautiful, clear room-filling illumination
      pointLightCeilingRef.current.diffuse = col2;
      pointLightCeilingRef.current.range = 8.0; // wider range for clear, natural coverage of all objects
    }

    // --- Channel 3: Desk Lamp ---
    const ch3 = state.channels[2];
    const col3 = nextOnColors[2];
    if (deskLampGlowMatRef.current) {
      if (ch3.isOn) {
        deskLampGlowMatRef.current.emissiveColor = col3.scale(0.35);
        deskLampGlowMatRef.current.diffuseColor = col3;
      } else {
        deskLampGlowMatRef.current.emissiveColor = new Color3(0.05, 0.05, 0.05);
        deskLampGlowMatRef.current.diffuseColor = new Color3(0.3, 0.3, 0.3);
      }
    }
    if (pointLightDeskRef.current) {
      pointLightDeskRef.current.intensity = ch3.isOn ? 0.5 : 0; // Natural, focused cozy desk light intensity
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
