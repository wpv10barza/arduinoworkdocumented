from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "src" / "main.cpp").read_text(encoding="utf-8")
CONFIG = (ROOT / "include" / "app_config.h").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github" / "workflows" / "firmware-and-pages.yml").read_text(encoding="utf-8")


def require(text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise AssertionError(f"missing {label}: {needle}")


# The backend endpoint must no longer be a firmware constant.
if "BACKEND_IP" in MAIN:
    raise AssertionError("BACKEND_IP must not exist in firmware source")
if "assistantBaseUrl" in MAIN:
    raise AssertionError("runtime endpoint must not use assistantBaseUrl")
for source_name, source in [("main.cpp", MAIN), ("app_config.h", CONFIG)]:
    private_ips = re.findall(r"192\.168\.\d+\.\d+", source)
    if private_ips:
        raise AssertionError(f"fixed private IP remains in {source}: {private_ips}")


# Required discovery path.
require(MAIN, "#include <ESPmDNS.h>", "mDNS include")
require(MAIN, "#include <Preferences.h>", "NVS Preferences include")
require(MAIN, 'constexpr char kBackendMdnsService[] = "3c";', "mDNS service name")
require(MAIN, 'constexpr char kBackendMdnsProtocol[] = "tcp";', "mDNS protocol")
require(MAIN, "MDNS.queryService(kBackendMdnsService, kBackendMdnsProtocol)", "mDNS service query")
require(MAIN, "MDNS.queryHost(kBackendLogicalHost)", "resolved backend address")
require(MAIN, "MDNS.port(index)", "discovered backend port")


# Required NVS cache path.
require(MAIN, "kBackendHostKey", "NVS logical host key")
if not re.search(r"backendPrefs\.getString\(\s*kBackendHostKey\s*,\s*kBackendLogicalHost\s*\)", MAIN):
    raise AssertionError("missing NVS logical host load expression")
require(MAIN, "backendPrefs.getString(kBackendAddressKey, \"\")", "NVS address load")
require(MAIN, "backendPrefs.getUShort(kBackendPortKey, 0)", "NVS port load")
require(MAIN, "backendPrefs.putString(kBackendHostKey, endpointValue.logicalHost)", "NVS logical host save")
require(MAIN, "backendPrefs.putString(kBackendAddressKey, endpointValue.address)", "NVS address save")
require(MAIN, "backendPrefs.putUShort(kBackendPortKey, endpointValue.port)", "NVS port save")
require(MAIN, 'constexpr char kBackendPrefsNamespace[] = "backend";', "NVS namespace")


# Cached endpoint must be loaded before Wi-Fi connection begins.
setup_pos = MAIN.index("void setup()")
setup = MAIN[setup_pos:]
load_pos = setup.index("loadBackendEndpointFromNvs();")
wifi_pos = setup.index("connectWifi();")
if load_pos >= wifi_pos:
    raise AssertionError("NVS endpoint must load before Wi-Fi connection")


# First health check uses the cache immediately; discovery only fills an absent cache.
health_pos = MAIN.index("bool checkBackendHealth()")
health = MAIN[health_pos:MAIN.index("int send3CCommand", health_pos)]
require(health, "if (!backendEndpoint.valid())", "cache-first health decision")
require(health, "discoverBackendEndpoint();", "initial discovery")


# A health failure must trigger a fresh mDNS lookup and one retry.
require(health, "const BackendEndpoint failedEndpoint = backendEndpoint;", "failed endpoint snapshot")
require(health, "rediscovering _%s._%s", "rediscovery log")
post_failure = health.split("if (checkBackendHealthOnce()) return true;", 1)[1]
require(post_failure, "if (!discoverBackendEndpoint()) return false;", "post-failure rediscovery")
require(health, "return checkBackendHealthOnce();", "post-rediscovery health retry")


# The command and polling paths must use the discovered runtime endpoint.
require(MAIN, 'endpoint("/api/device/v1/commands")', "command endpoint")
require(MAIN, 'endpoint("/api/device/v1/commands/" + lastCommandId)', "poll endpoint")


# Canonical discovery identity must remain aligned with the backend advertiser contract.
CONTRACT = ROOT / "contract" / "device-command-v1.json"
contract = __import__("json").loads(CONTRACT.read_text(encoding="utf-8"))
discovery = contract["discovery"]
require(MAIN, f'constexpr char kBackendLogicalHost[] = "{discovery["logical_host"]}";', "canonical logical host")
require(MAIN, 'constexpr char kBackendMdnsService[] = "3c";', "canonical mDNS service")

# CI must execute this contract before the hardware build.
require(WORKFLOW, "python tests/test_backend_discovery.py", "GitHub Actions backend discovery test")

print("Backend discovery contract: PASS")
print("- no BACKEND_IP or fixed private IP remains")
print("- Wi-Fi -> mDNS _3c._tcp -> 3c-backend.local -> resolved IP + port")
print("- endpoint cached/loaded through NVS Preferences")
print("- cached endpoint is used before rediscovery")
print("- failed health triggers rediscovery and one retry")
