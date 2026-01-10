/**
 * Node-RED Settings for Maestra
 * Optimized for creative technology orchestration
 */

module.exports = {
    // =============================================================================
    // FLOW EDITOR SETTINGS
    // =============================================================================

    // The tcp port that the Node-RED web server is listening on
    uiPort: process.env.PORT || 1880,

    // The maximum size of HTTP request that will be accepted by the runtime API.
    apiMaxLength: '10mb',

    // The maximum size of messages sent between nodes
    maxMessageSize: 10485760, // 10MB for media/large payloads

    // =============================================================================
    // RUNTIME SETTINGS
    // =============================================================================

    // By default, all user data is stored in a directory called `.node-red` under
    // the user's home directory. To use a different location, the following
    // property can be used
    userDir: '/data',

    // Node-RED scans the `nodes` directory in the userDir to find local node files
    nodesDir: '/data/nodes',

    // By default, the Node-RED UI is available at http://localhost:1880/
    // The following property can be used to specify a different root path.
    httpAdminRoot: '/',

    // Some nodes, such as HTTP In, can be used to listen for incoming http requests.
    // By default, these are served relative to '/'. The following property
    // can be used to specifiy a different root path. If set to false, this is
    // disabled.
    httpNodeRoot: '/api',

    // =============================================================================
    // SECURITY SETTINGS
    // =============================================================================

    // To password protect the Node-RED editor and admin API, the following
    // property can be used. See http://nodered.org/docs/security.html for details.
    // adminAuth: {
    //     type: "credentials",
    //     users: [{
    //         username: "admin",
    //         password: "$2a$08$zZWtXTja0fB1pzD4sHCMyOCMYz2Z6dNbM6tl8sJogENOMcxWV9DN.",
    //         permissions: "*"
    //     }]
    // },

    // =============================================================================
    // LOGGING
    // =============================================================================

    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false
        }
    },

    // =============================================================================
    // EDITOR SETTINGS
    // =============================================================================

    // Customising the editor
    editorTheme: {
        projects: {
            enabled: true,
            workflow: {
                mode: "auto"
            }
        },
        header: {
            title: "Maestra Logic Engine",
            image: "/absolute/path/to/maestra-logo.png" // TODO: Add logo
        },
        palette: {
            editable: true,
            catalogues: [
                'https://catalogue.nodered.org/catalogue.json'
            ]
        },
        codeEditor: {
            lib: "monaco",
            options: {
                theme: "vs-dark",
                fontSize: 14,
                fontFamily: "JetBrains Mono, Fira Code, monospace"
            }
        }
    },

    // =============================================================================
    // NODE SETTINGS
    // =============================================================================

    // Configure the function node
    functionGlobalContext: {
        // os:require('os'),
        // Maestra-specific global objects
        maestra: {
            natsUrl: process.env.NATS_URL || 'nats://nats:4222',
            mqttBroker: process.env.MQTT_BROKER || 'mosquitto:1883',
            redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
            postgresUrl: process.env.DATABASE_URL || 'postgresql://maestra:maestra_dev_password@postgres:5432/maestra'
        }
    },

    // Configure the timeout value for Function nodes
    functionExternalModules: true,
    functionTimeout: 60, // seconds

    // =============================================================================
    // CONTEXT STORAGE
    // =============================================================================

    // Context Storage
    // Using file-based context storage for persistence
    contextStorage: {
        default: "file",
        file: {
            module: "localfilesystem",
            config: {
                dir: "/data/context",
                cache: true
            }
        }
    },

    // =============================================================================
    // CUSTOM NODES & PLUGINS
    // =============================================================================

    // Preinstalled nodes for Maestra
    // Install these via Docker image or manually:
    // - node-red-contrib-osc
    // - node-red-contrib-nats
    // - node-red-contrib-mqtt-broker
    // - node-red-dashboard
    // - node-red-contrib-postgres
    // - node-red-contrib-redis
    // - node-red-contrib-web-worldmap
    // - node-red-contrib-socketio

    // =============================================================================
    // DEBUGGING
    // =============================================================================

    // By default, the Node-RED UI accepts connections on all IPv4 interfaces.
    // To listen on all IPv6 addresses, use "::",
    // uiHost: "::",

    // By default, credentials are encrypted in storage using a generated key. To
    // specify your own secret, set the following property.
    // credentialSecret: "maestra-node-red-secret-key",

    // =============================================================================
    // PERFORMANCE
    // =============================================================================

    // The maximum length, in characters, of any single debug message sent to the editor.
    debugMaxLength: 10000,

    // Maximum number of messages to keep in the debug pane
    debugUseColors: true,

    // Timeout in milliseconds for TCP server socket connections defaults to no timeout
    // socketTimeout: 120000,

    // =============================================================================
    // FLOW FILE SETTINGS
    // =============================================================================

    // The file containing the flows. If not set, it defaults to flows_<hostname>.json
    flowFile: 'flows.json',

    // To enabled pretty-printing of the flow within the flow file, set the following
    // property to true:
    flowFilePretty: true,

    // =============================================================================
    // CUSTOM MAESTRA SETTINGS
    // =============================================================================

    // Maestra-specific settings accessible in flows
    maestraConfig: {
        deviceTypes: [
            'arduino',
            'raspberry_pi',
            'esp32',
            'touchdesigner',
            'max_msp',
            'unreal_engine',
            'web_client',
            'mobile_client'
        ],
        enableOSC: true,
        enableMQTT: true,
        enableNATS: true,
        enableWebSockets: true
    }
};
