# OPS-115 Environment Variable Comparison

**Date:** 2026-07-23T12:22:26.592Z

## Sources Audited

| Source | File |
|---|---|
| project example | .env.project.example |
| local override | .env.local |
| northflank env vars | northflank.json |
| northflank secrets | northflank.json (secrets list) |
| github secrets | .github/workflows/deploy.yml |
| current process | process.env (sanitized) |
| OPS-109 benchmark | ops109-benchmark.ts (inferred) |

## Variable Comparison

| Variable | OPS-109 Value | Current (.env.project.example) | Northflank | GitHub Secrets | Missing? | Different? | Notes |
|---|---|---|---|---|---|---|---|
| ABSOLUTE_TIMEOUT_SECONDS | [UNKNOWN] | 150                           ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| ADMIN_JWT_SECRET | [UNKNOWN] | REPLACE_WITH_ADMIN_JWT_SECRET ... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| AGENT | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| AI_PROVIDER | [UNKNOWN] | local-rembg                   ... | local-rembg | [NOT SET] | NO | YES |  |
| AI_PROVIDER_API_KEY | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| AI_PROVIDER_NAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ALLOWED_ORIGINS | [UNKNOWN] | https://www.thannow.com       ... | https://www.thannow.com | [NOT SET] | NO | YES |  |
| ALLUSERSPROFILE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| APPDATA | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| Access Key ID | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| BACKGROUND_API_URL | [NOT USED — ops109 was restoration only] | krovsimtvnr75h                ... | krovsimtvnr75h | [NOT SET] | NO | YES |  |
| CHROME_CRASHPAD_PIPE_NAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| CLOUDFLARE_ACCOUNT_ID | [UNKNOWN] | 2eb5eadd4af6da3d3a5f6c61d92437... | [NOT SET] | [SECRET_REF] | NO | YES |  |
| CLOUDFLARE_API_TOKEN | [UNKNOWN] | [EMPTY] | [NOT SET] | [SECRET_REF] | NO | NO |  |
| CLOUDFLARE_PAGES_PROJECT | [UNKNOWN] | ai-photo-studio-frontend      ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| CLOUDFLARE_ZONE_ID | [UNKNOWN] | REPLACE_WITH_CLOUDFLARE_ZONE_I... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| COLOR | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| COMPUTERNAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ComSpec | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| CommonProgramFiles | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| CommonProgramFiles(x86) | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| CommonProgramW6432 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| DATABASE_URL | [UNKNOWN] | [EMPTY] | [SECRET_REF] | [NOT SET] | NO | NO |  |
| DEEPSEEK_API_KEY | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| DELIVERY_MODE | [UNKNOWN] | WHATSAPP                      ... | WHATSAPP | [NOT SET] | NO | YES |  |
| DEV_WORKSPACE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| DriverData | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EDITOR | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EFC_8736_1262719628 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EFC_8736_1592913036 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EFC_8736_2283032206 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EFC_8736_2775293581 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EFC_8736_3789132940 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EFC_8736_4126798990 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ELECTRON_RUN_AS_NODE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| EXPECTED_GIT_BRANCH | [UNKNOWN] | main                          ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| EXPECTED_GIT_REMOTE | [UNKNOWN] | https://github.com/ai-photo-st... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_API_URL | [UNKNOWN] | https://ai-photo-studio-api-mp... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_ARTIFACT_REGISTRY | [UNKNOWN] | ai-photo-studio-api           ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_BG_REMOVER_URL | [UNKNOWN] | https://ai-photo-studio-bg-rem... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_CLOUDRUN_SERVICE | [UNKNOWN] | ai-photo-studio-api           ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_CLOUDSQL_INSTANCE | [UNKNOWN] | ai-photo-studio-db            ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_PROJECT_ID | [UNKNOWN] | project-9540c255-c960-4fa0-a91... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_REDIS_INSTANCE | [UNKNOWN] | ai-photo-studio-redis         ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_REGION | [UNKNOWN] | us-central1                   ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GCP_SERVICE_ACCOUNT | [UNKNOWN] | github-actions-deploy@project-... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| GEMINI_API_KEY | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| GITHUB_TOKEN | [UNKNOWN] | [EMPTY] | [NOT SET] | [SECRET_REF] | NO | NO |  |
| HOME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| HOMEDRIVE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| HOMEPATH | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| IC_LIGHT_LAB_URL | [UNKNOWN] | https://api.thannow.com/ai/ic-... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| INIT_CWD | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| JWT_SECRET | [UNKNOWN] | REPLACE_WITH_JWT_SECRET       ... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| KILO | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILOCODE_EDITOR_NAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILOCODE_FEATURE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILOCODE_VERSION | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_APP_NAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_APP_VERSION | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_CLIENT | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_DISABLE_CHANNEL_DB | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_DISABLE_CLAUDE_CODE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_EDITOR_NAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_ENABLE_QUESTION_TOOL | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_LANCEDB_PATH | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_MACHINE_ID | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_PARENT_PID | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_PID | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_PLATFORM | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_PROCESS_ROLE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_RUN_ID | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_SERVER_PASSWORD | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_TELEMETRY_LEVEL | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_TREE_SITTER_WASM_DIR | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| KILO_VSCODE_VERSION | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| LOCALAPPDATA | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| LOGONSERVER | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| MIMALLOC_PURGE_DELAY | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| NEON_API_KEY | [UNKNOWN] | REPLACE_WITH_NEON_API_KEY     ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| NEON_DATABASE_URL | [UNKNOWN] | postgresql://user:password@neo... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| NEON_DIRECT_URL | [UNKNOWN] | postgresql://user:password@neo... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| NEON_POOLER_URL | [UNKNOWN] | postgresql://user:password@neo... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| NEON_PROJECT_ID | [UNKNOWN] | REPLACE_WITH_NEON_PROJECT_ID  ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| NODE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| NODE_ENV | [UNKNOWN] | [EMPTY] | production | [NOT SET] | NO | NO |  |
| NODE_USE_SYSTEM_CA | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| NORTHFLANK_API_TOKEN | [UNKNOWN] | [EMPTY] | [NOT SET] | [SECRET_REF] | NO | NO |  |
| NUMBER_OF_PROCESSORS | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| OPENAI_API_KEY | [NOT USED — ops109 used Replicate] | sk-proj-D5ySDfMe3lbzjuaF7b38Me... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| OPENCODE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| OS | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| OneDrive | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PATHEXT | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PAYMENT_GATEWAY_BASE_URL | [UNKNOWN] | REPLACE_WITH_PAYMENT_GATEWAY_U... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PAYMENT_GATEWAY_NAME | [UNKNOWN] | manual                        ... | manual | [NOT SET] | NO | YES |  |
| PAYMENT_GATEWAY_SECRET | [UNKNOWN] | REPLACE_WITH_PAYMENT_GATEWAY_S... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PORT | [UNKNOWN] | [EMPTY] | 8080 | [NOT SET] | NO | NO |  |
| PROCESSING_TIMEOUT_SECONDS | [UNKNOWN] | 90                            ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PROCESSOR_ARCHITECTURE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PROCESSOR_IDENTIFIER | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PROCESSOR_LEVEL | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PROCESSOR_REVISION | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PRODUCTION_API_DOMAIN | [UNKNOWN] | api.thannow.com               ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PRODUCTION_API_URL | [UNKNOWN] | https://api.thannow.com       ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PRODUCTION_FRONTEND_DOMAIN | [UNKNOWN] | www.thannow.com               ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PRODUCTION_FRONTEND_URL | [UNKNOWN] | https://www.thannow.com       ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PRODUCT_CLASSIFIER_URL | [UNKNOWN] | https://api.thannow.com/ai/pro... | http://10.0.0.1:8080 | [NOT SET] | NO | YES |  |
| PROJECT_SIGNATURE | [UNKNOWN] | AI_PHOTO_STUDIO_WHATSAPP__GARD... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| PROMPT | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PSModulePath | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| PUBLIC | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| Path | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ProgramData | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ProgramFiles | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ProgramFiles(x86) | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| ProgramW6432 | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| QUEUE_TIMEOUT_SECONDS | [UNKNOWN] | 60                            ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| R2_ACCESS_KEY_ID | [UNKNOWN] | REPLACE_WITH_R2_ACCESS_KEY_ID ... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| R2_ACCOUNT_ID | [UNKNOWN] | 2eb5eadd4af6da3d3a5f6c61d92437... | 2eb5eadd4af6da3d3a5f6c61d92437... | [NOT SET] | NO | YES |  |
| R2_BUCKET_NAME | [UNKNOWN] | ai-photo-studio-storage       ... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| R2_ENDPOINT | [UNKNOWN] | [EMPTY] | [SECRET_REF] | [NOT SET] | NO | NO |  |
| R2_PUBLIC_BASE_URL | [UNKNOWN] | https://2eb5eadd4af6da3d3a5f6c... | https://2eb5eadd4af6da3d3a5f6c... | [NOT SET] | NO | YES |  |
| R2_SECRET_ACCESS_KEY | [UNKNOWN] | REPLACE_WITH_R2_SECRET_ACCESS_... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| RAILWAY_ENVIRONMENT | [UNKNOWN] | production                    ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RAILWAY_ENVIRONMENT_ID | [UNKNOWN] | 13228f5e-8af5-4f5e-b57e-b1dfcc... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RAILWAY_PROJECT_ID | [UNKNOWN] | ad62f340-fcfd-4989-b5bb-18753b... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RAILWAY_PROJECT_NAME | [UNKNOWN] | AI Photo Studio WhatsApp      ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RAILWAY_SERVICE | [UNKNOWN] | api                           ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| REAL_ESRGAN_URL | [NOT USED — ops109 used GFPGANProvider (Replicate) for upscaling] | https://api.thannow.com/ai/rea... | [NOT SET] | [NOT SET] | PARTIAL | NO | KEY DIFFERENCE: OPS-109 used GFPGANProvider (Replicate tencentarc/gfpgan model) for upscaling. Current pipeline uses RealEsrganService with REAL_ESRGAN_URL, which is empty → passthrough. |
| REDIS_URL | [UNKNOWN] | [EMPTY] | [SECRET_REF] | [NOT SET] | NO | NO |  |
| REPLICATE_API_TOKEN | [SET — required by ops109] | r8_cJuo0CUoyRRBGfMhJEwekMa7mGy... | [NOT SET] | [NOT SET] | PARTIAL | NO | Present in both. OPS-109 used it for ALL stages (flux, gfpgan, esrgan via Replicate). Current pipeline uses it only for FLUX Restore, then switches to RunPod for remaining stages. |
| RESTORATION_ENDPOINT_URL | [NOT USED — ops109 used Replicate directly] | 3z633s11yn4n8q                ... | 3z633s11yn4n8q | [NOT SET] | NO | YES | KEY DIFFERENCE: OPS-109 did not use this. Current pipeline uses this RunPod endpoint ID for GFPGAN/DDColor/LaMa transport, but RUNPOD_API_KEY is needed and missing. |
| RUNPOD_API_KEY | [NOT USED — ops109 did not use RunPod] | REPLACE_WITH_RUNPOD_API_KEY   ... | [SECRET_REF] | [NOT SET] | NO | YES | KEY DIFFERENCE: OPS-109 did not need this. Current pipeline requires it for local stage transport (RESTORATION_ENDPOINT_URL resolved to RunPod endpoint). Missing RunPod key = no GFPGAN/DDColor/LaMa execution. |
| RUNPOD_BG_REMOVER_ENDPOINT | [UNKNOWN] | REPLACE_WITH_BG_REMOVER_ENDPOI... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_CODEFORMER_ENDPOINT | [UNKNOWN] | REPLACE_WITH_CODEFORMER_ENDPOI... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_DDCOLOR_ENDPOINT | [UNKNOWN] | REPLACE_WITH_DDCOLOR_ENDPOINT_... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_GFPGAN_ENDPOINT | [UNKNOWN] | REPLACE_WITH_GFPGAN_ENDPOINT_I... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_LAMA_ENDPOINT | [UNKNOWN] | REPLACE_WITH_LAMA_ENDPOINT_ID ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_REAL_ESRGAN_ENDPOINT | [UNKNOWN] | REPLACE_WITH_REAL_ESRGAN_ENDPO... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_S3_ACCESS_KEY | [UNKNOWN] | REPLACE_WITH_S3_ACCESS_KEY    ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| RUNPOD_S3_SECRET_KEY | [UNKNOWN] | REPLACE_WITH_S3_SECRET_KEY    ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| SESSIONNAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| STORAGE_PROVIDER | [UNKNOWN] | r2                            ... | r2 | [NOT SET] | NO | YES |  |
| Secret Access Key | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| SystemDrive | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| SystemRoot | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| TEMP | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| TMP | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| Token value | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| UPSTASH_REDIS_ENDPOINT | [UNKNOWN] | REPLACE_WITH_UPSTASH_URL.upsta... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| UPSTASH_REDIS_PORT | [UNKNOWN] | 6379                          ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| UPSTASH_REDIS_REST_TOKEN | [UNKNOWN] | REPLACE_WITH_UPSTASH_TOKEN    ... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| UPSTASH_REDIS_REST_URL | [UNKNOWN] | https://REPLACE_WITH_UPSTASH_U... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| USERDOMAIN | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| USERDOMAIN_ROAMINGPROFILE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| USERNAME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| USERPROFILE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_CODE_CACHE_PATH | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_CRASH_REPORTER_PROCESS_TYPE | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_CWD | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_ESM_ENTRYPOINT | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_EXTENSIONS | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_HANDLES_UNCAUGHT_ERRORS | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_IPC_HOOK | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_NLS_CONFIG | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| VSCODE_PID | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| WHATSAPP_ACCESS_TOKEN | [UNKNOWN] | REPLACE_WITH_WHATSAPP_ACCESS_T... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| WHATSAPP_PHONE_NUMBER_ID | [UNKNOWN] | REPLACE_WITH_WHATSAPP_PHONE_NU... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| WHATSAPP_VERIFY_TOKEN | [UNKNOWN] | REPLACE_WITH_WHATSAPP_VERIFY_T... | [SECRET_REF] | [NOT SET] | NO | YES |  |
| XDG_CACHE_HOME | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| YOLO_DETECTOR_URL | [UNKNOWN] | https://api.thannow.com/ai/yol... | [NOT SET] | [NOT SET] | PARTIAL | NO |  |
| ZES_ENABLE_SYSMAN | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_command | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_cache | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_global_prefix | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_globalconfig | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_init_module | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_local_prefix | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_node_gyp | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_noproxy | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_npm_version | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_prefix | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_store_dir | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_user_agent | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_config_userconfig | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_execpath | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_lifecycle_event | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_lifecycle_script | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_node_execpath | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_package_json | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_package_name | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| npm_package_version | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| org_id | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |
| windir | [UNKNOWN] | [EMPTY] | [NOT SET] | [NOT SET] | YES | NO |  |