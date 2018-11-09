"use strict";

// SETTINGS of this demo :
const SETTINGS = {
    rotationOffsetX: 0, // negative -> look upper. in radians
    cameraFOV: 40,      // in degrees, 3D camera FOV
    pivotOffsetYZ: [0.2,0.2], // XYZ of the distance between the center of the cube and the pivot
    detectionThreshold: 0.75, // sensibility, between 0 and 1. Less -> more sensitive
    detectionHysteresis: 0.05,
    scale: 1 // scale of the 3D cube
};

// some globalz :
let THREEVIDEOTEXTURE
let THREERENDERER
let THREEFACEOBJ3D
let THREEFACEOBJ3DPIVOTED
let THREESCENE
let THREECAMERA;
let ISDETECTED = false;
let CANVAS;


// callback : launched if a face is detected or lost. TODO : add a cool particle effect WoW !
function detect_callback(isDetected) {
    if (isDetected) {
        console.log('INFO in detect_callback() : DETECTED');
    } else {
        console.log('INFO in detect_callback() : LOST');
    }
}

// build the 3D. called once when Jeeliz Face Filter is OK
function init_threeScene(spec) {
    CANVAS = document.getElementById('jeeFaceFilterCanvas');

    // INIT THE THREE.JS context
    THREERENDERER = new THREE.WebGLRenderer({
        context: spec.GL,
        canvas: spec.canvasElement
    });

    // COMPOSITE OBJECT WHICH WILL FOLLOW THE HEAD
    // in fact we create 2 objects to be able to shift the pivot point
    THREEFACEOBJ3D = new THREE.Object3D();
    THREEFACEOBJ3D.frustumCulled = false;
    THREEFACEOBJ3DPIVOTED = new THREE.Object3D();
    THREEFACEOBJ3DPIVOTED.frustumCulled = false;
    THREEFACEOBJ3DPIVOTED.position.set(0, -SETTINGS.pivotOffsetYZ[0], -SETTINGS.pivotOffsetYZ[1]);
    THREEFACEOBJ3DPIVOTED.scale.set(SETTINGS.scale, SETTINGS.scale, SETTINGS.scale);
    THREEFACEOBJ3D.add(THREEFACEOBJ3DPIVOTED);

    // CREATE OUR HELMET MESH AND ADD IT TO OUR SCENE
    let HELMETOBJ3D = new THREE.Object3D();
    let helmetMesh;
    let visiereMesh;
    let faceMesh;

    const loadingManager = new THREE.LoadingManager();

    const helmetLoader = new THREE.BufferGeometryLoader(loadingManager);

    helmetLoader.load(
        './models/helmet/helmet.json',
        (helmetGeometry) => {
            const helmetMaterial = new THREE.MeshPhongMaterial({
                map: new THREE.TextureLoader().load('./models/helmet/diffuse_helmet.jpg'),
                reflectionRatio: 1,
                shininess: 50
            });

            helmetMesh = new THREE.Mesh(helmetGeometry, helmetMaterial);
            helmetMesh.scale.multiplyScalar(0.037);
            helmetMesh.position.y -= 0.3;
            helmetMesh.position.z -= 0.5;
            helmetMesh.rotation.x += 0.5;
        }
    )

    const visiereLoader = new THREE.BufferGeometryLoader(loadingManager);
    visiereLoader.load(
        './models/helmet/visiere.json',
        (visiereGeometry) => {
            const visiereMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.5,
                side: THREE.FrontSide
            })

            visiereMesh = new THREE.Mesh(visiereGeometry, visiereMaterial);
            visiereMesh.scale.multiplyScalar(0.037);
            visiereMesh.position.y -= 0.3;
            visiereMesh.position.z -= 0.5;
            visiereMesh.rotation.x += 0.5;
            visiereMesh.frustumCulled = false;
        }
    )

    // CREATE THE MASK
    const maskLoader = new THREE.BufferGeometryLoader(loadingManager);
    /*
    faceLowPolyEyesEarsFill.json has been exported from dev/faceLowPolyEyesEarsFill.blend using THREE.JS blender exporter with Blender v2.76
    */
    maskLoader.load('./models/face/faceLowPolyEyesEarsFill2.json', function (maskBufferGeometry) {
        const vertexShaderSource = 'varying vec2 vUVvideo;\n\
        varying float vY, vNormalDotZ;\n\
        const float THETAHEAD=0.25;\n\
        void main() {\n\
            vec4 mvPosition = modelViewMatrix * vec4( position, 1.0);\n\
            vec4 projectedPosition=projectionMatrix * mvPosition;\n\
            gl_Position=projectedPosition;\n\
            \n\
            //compute UV coordinates on the video texture :\n\
            vec4 mvPosition0 = modelViewMatrix * vec4( position, 1.0 );\n\
            vec4 projectedPosition0=projectionMatrix * mvPosition0;\n\
            vUVvideo=vec2(0.5,0.5)+0.5*projectedPosition0.xy/projectedPosition0.w;\n\
            vY=position.y*cos(THETAHEAD)-position.z*sin(THETAHEAD);\n\
            vec3 normalView=vec3(modelViewMatrix * vec4(normal,0.));\n\
            vNormalDotZ=pow(abs(normalView.z), 1.5);\n\
        }';

       const fragmentShaderSource = "precision lowp float;\n\
        uniform sampler2D samplerVideo;\n\
        varying vec2 vUVvideo;\n\
        varying float vY, vNormalDotZ;\n\
        void main() {\n\
            vec3 videoColor=texture2D(samplerVideo, vUVvideo).rgb;\n\
            float darkenCoeff=smoothstep(-0.15, 0.05, vY);\n\
            float borderCoeff=smoothstep(0.0, 0.55, vNormalDotZ);\n\
            gl_FragColor=vec4(videoColor*(1.-darkenCoeff), borderCoeff );\n\
            // gl_FragColor=vec4(borderCoeff, 0., 0., 1.);\n\
            // gl_FragColor=vec4(darkenCoeff, 0., 0., 1.);\n\
        }";

        const mat = new THREE.ShaderMaterial({
            vertexShader: vertexShaderSource,
            fragmentShader: fragmentShaderSource,
            transparent: true,
            flatShading: false,
            uniforms: {
                samplerVideo:{ value: THREEVIDEOTEXTURE }
            }
           ,transparent: true
        });
        maskBufferGeometry.computeVertexNormals();
        faceMesh = new THREE.Mesh(maskBufferGeometry, mat);
        faceMesh.renderOrder = -10000;
        faceMesh.frustumCulled = false;
        faceMesh.scale.multiplyScalar(1.12);
        faceMesh.position.set(0, 0.3, -0.25);
    })

    loadingManager.onLoad = () => {
        HELMETOBJ3D.add(helmetMesh);
        HELMETOBJ3D.add(visiereMesh);
        HELMETOBJ3D.add(faceMesh);

        addDragEventListener(HELMETOBJ3D);
        
        THREEFACEOBJ3DPIVOTED.add(HELMETOBJ3D);
    }

    // CREATE THE SCENE
    THREESCENE = new THREE.Scene();
    THREESCENE.add(THREEFACEOBJ3D);

    // init video texture with red
    THREEVIDEOTEXTURE = new THREE.DataTexture(new Uint8Array([255,0,0]), 1, 1, THREE.RGBFormat);
    THREEVIDEOTEXTURE.needsUpdate = true;

    // CREATE THE VIDEO BACKGROUND
    function create_mat2d(threeTexture, isTransparent){ //MT216 : we put the creation of the video material in a func because we will also use it for the frame
        return new THREE.RawShaderMaterial({
            depthWrite: false,
            depthTest: false,
            transparent: isTransparent,
            vertexShader: "attribute vec2 position;\n\
                varying vec2 vUV;\n\
                void main(void){\n\
                    gl_Position=vec4(position, 0., 1.);\n\
                    vUV=0.5+0.5*position;\n\
                }",
            fragmentShader: "precision lowp float;\n\
                uniform sampler2D samplerVideo;\n\
                varying vec2 vUV;\n\
                void main(void){\n\
                    gl_FragColor=texture2D(samplerVideo, vUV);\n\
                }",
             uniforms:{
                samplerVideo: { value: threeTexture }
             }
        });
    }
    const videoMaterial =create_mat2d(THREEVIDEOTEXTURE, false);
    const videoGeometry = new THREE.BufferGeometry()
    const videoScreenCorners = new Float32Array([-1,-1,   1,-1,   1,1,   -1,1]);
    videoGeometry.addAttribute('position', new THREE.BufferAttribute( videoScreenCorners, 2));
    videoGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0,1,2, 0,2,3]), 1));
    const videoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
    videoMesh.onAfterRender = function () {
        // replace THREEVIDEOTEXTURE.__webglTexture by the real video texture
        THREERENDERER.properties.update(THREEVIDEOTEXTURE, '__webglTexture', spec.videoTexture);
        THREEVIDEOTEXTURE.magFilter = THREE.LinearFilter;
        THREEVIDEOTEXTURE.minFilter = THREE.LinearFilter;
        delete(videoMesh.onAfterRender);
    };
    videoMesh.renderOrder = -1000; // render first
    videoMesh.frustumCulled = false;
    THREESCENE.add(videoMesh);

    //MT216 : create the frame. We reuse the geometry of the video
    const calqueMesh = new THREE.Mesh(videoGeometry,  create_mat2d(new THREE.TextureLoader().load('./images/frame_rupy.png'), true))
    calqueMesh.renderOrder = 999; // render last
    calqueMesh.frustumCulled = false;
    THREESCENE.add(calqueMesh);

    // CREATE THE CAMERA
    const aspecRatio = spec.canvasElement.width / spec.canvasElement.height;
    THREECAMERA = new THREE.PerspectiveCamera(SETTINGS.cameraFOV, aspecRatio, 0.1, 100);

    // CREATE THE LIGHTS

    const ambientLight = new THREE.AmbientLight( 0x404040 ); // soft white light
    THREESCENE.add(ambientLight);

    const dirLight = new THREE.DirectionalLight( 0xffffff );
    dirLight.position.set( 100, 1000, 100 );

    THREESCENE.add(dirLight)
} // end init_threeScene()

//launched by body.onload() :
function main(){
    JeelizResizer.size_canvas({
        canvasId: 'jeeFaceFilterCanvas',
        callback: function(isError, bestVideoSettings){
            init_faceFilter(bestVideoSettings);
        }
    })
} //end main()

function init_faceFilter(videoSettings){
    JEEFACEFILTERAPI.init({
        canvasId: 'jeeFaceFilterCanvas',
        NNCpath: '../../../dist/', // root of NNC.json file
        videoSettings: videoSettings,
        callbackReady: function (errCode, spec) {
            if (errCode) {
                console.log('AN ERROR HAPPENS. SORRY BRO :( . ERR =', errCode);
                return;
            }

            console.log('INFO : JEEFACEFILTERAPI IS READY');
            init_threeScene(spec);
        }, // end callbackReady()

        // called at each render iteration (drawing loop)
        callbackTrack: function (detectState) {
            if (ISDETECTED && detectState.detected < SETTINGS.detectionThreshold - SETTINGS.detectionHysteresis) {
                // DETECTION LOST
                detect_callback(false);
                ISDETECTED = false;
            } else if (!ISDETECTED && detectState.detected > SETTINGS.detectionThreshold + SETTINGS.detectionHysteresis) {
                // FACE DETECTED
                detect_callback(true);
                ISDETECTED = true;
            }

            if (ISDETECTED) {
                // move the cube in order to fit the head
                const tanFOV = Math.tan(THREECAMERA.aspect * THREECAMERA.fov * Math.PI / 360); // tan(FOV/2), in radians
                const W = detectState.s;  // relative width of the detection window (1-> whole width of the detection window)
                const D = 1 / (2 * W * tanFOV); // distance between the front face of the cube and the camera
                
                // coords in 2D of the center of the detection window in the viewport :
                const xv = detectState.x;
                const yv = detectState.y;
                
                // coords in 3D of the center of the cube (in the view coordinates system)
                const z = -D - 0.5;   // minus because view coordinate system Z goes backward. -0.5 because z is the coord of the center of the cube (not the front face)
                const x = xv * D * tanFOV;
                const y = yv * D * tanFOV / THREECAMERA.aspect;

                // move and rotate the cube
                THREEFACEOBJ3D.position.set(x, y + SETTINGS.pivotOffsetYZ[0], z + SETTINGS.pivotOffsetYZ[1]);
                THREEFACEOBJ3D.rotation.set(detectState.rx + SETTINGS.rotationOffsetX, detectState.ry, detectState.rz, "XYZ");
            }

            // reinitialize the state of THREE.JS because JEEFACEFILTER have changed stuffs
            THREERENDERER.state.reset();

            // trigger the render of the THREE.JS SCENE
            THREERENDERER.render(THREESCENE, THREECAMERA);
        } // end callbackTrack()
    }); // end JEEFACEFILTERAPI.init call
} // end main()
