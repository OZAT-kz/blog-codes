# ==============================================================================
# Google Cloud Media CDN Origin Shielding & Dual-Token Anti-Piracy Manager (KZ)
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/media_cdn_edge_cache_and_dual_token_kz.py
# ==============================================================================

import hmac
import hashlib
import time
import base64
from typing import Dict, Any, Optional
from google.cloud import edgecache_v1
from google.api_core.client_options import ClientOptions

class MediaCDNSecurityManager:
    """
    Управление Google Cloud Media CDN Edge Cache Service, Origin Shielding
    и генерация криптографических Dual-Token подписей (Anti-Piracy) 
    для стримов с нагрузкой свыше 2 000 000 одновременных зрителей.
    """
    def __init__(self, project_id: str, secret_key: bytes, edge_service_name: str):
        self.project_id = project_id
        self.secret_key = secret_key
        self.edge_service_name = edge_service_name
        self.client = edgecache_v1.EdgeCacheServicesClient(
            client_options=ClientOptions(api_endpoint="edgecache.googleapis.com")
        )

    def generate_dual_token_signature(
        self, 
        user_session_id: str, 
        client_ip: str, 
        stream_path: str, 
        validity_seconds: int = 120
    ) -> str:
        """
        Генерирует короткоживущий HMAC-SHA256 токен для Low-Latency CMAF чанков.
        Edge-ноды Google Media CDN валидируют токен прямо в точке присутствия (PoP),
        отсекая неавторизованные рестримы за 0.2 мс без запроса к Origin Auth API.
        """
        expires_at = int(time.time()) + validity_seconds
        
        # Нормализация IP подсети для мобильных операторов Казахстана (Beeline, Kcell, Tele2)
        ip_subnet = ".".join(client_ip.split(".")[:3]) + ".0/24" if ":" not in client_ip else client_ip
        
        payload = f"URL={stream_path}&IP={ip_subnet}&SES={user_session_id}&EXP={expires_at}"
        signature = hmac.new(
            self.secret_key, 
            payload.encode("utf-8"), 
            hashlib.sha256
        ).digest()
        
        token = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
        return f"{payload}&SIG={token}"

    def configure_origin_shield_routing(self) -> Dict[str, Any]:
        """
        Конфигурация Media CDN с Origin Shielding, HTTP/3 (QUIC) и кэшированием LL-HLS.
        """
        route_rule = {
            "description": "Live LL-HLS and CMAF Chunks Routing with Shielding",
            "match_rules": [
                {"prefix_match": "/hls_live_out/"}
            ],
            "priority": 1,
            "route_action": {
                "cdn_policy": {
                    "cache_mode": edgecache_v1.EdgeCacheService.RouteRule.CdnPolicy.CacheMode.CACHE_ALL_STATIC,
                    "default_ttl": "2s",
                    "max_ttl": "8s",
                    "client_ttl": "1s",
                    "origin_shield_location": "europe-west3",
                    "signed_request_mode": edgecache_v1.EdgeCacheService.RouteRule.CdnPolicy.SignedRequestMode.REQUIRE_TOKENS,
                    "signed_request_keyset": f"projects/{self.project_id}/locations/global/edgeCacheKeysets/shavkat-live-keyset",
                    "add_signatures": {
                        "actions": ["GENERATE_COOKIE"]
                    }
                },
                "cors_policy": {
                    "allow_origins": ["https://stream.kazakh-mma.kz"],
                    "allow_methods": ["GET", "OPTIONS", "HEAD"],
                    "allow_headers": ["*"],
                    "max_age": "3600s"
                }
            }
        }
        return route_rule

    def purge_corrupted_manifest(self, manifest_relative_path: str):
        """Мгновенный инвалидатор мастер-манифеста по всей глобальной сети Google Media CDN."""
        request = edgecache_v1.InvalidateEdgeCacheServiceRequest(
            name=f"projects/{self.project_id}/locations/global/edgeCacheServices/{self.edge_service_name}",
            path=manifest_relative_path
        )
        operation = self.client.invalidate(request=request)
        print(f"🔥 Cache Invalidation Dispatched for {manifest_relative_path}. Op ID: {operation.name}")
