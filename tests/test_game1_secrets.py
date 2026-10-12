import base64
import json
import unittest
from scripts.game1_check_secrets import findings


class SecretTests(unittest.TestCase):
    def test_sensitive_keys_are_blocked(self):
        self.assertTrue(findings('sb_' + 'secret_' + 'x' * 24))
        self.assertTrue(findings('-----BEGIN ' + 'PRIVATE KEY-----'))
        self.assertTrue(findings('gh' + 'p_' + 'x' * 36))
        self.assertTrue(findings('postgresql://' + 'user:pass@localhost/db'))

    def test_service_role_jwt_is_blocked(self):
        payload = base64.urlsafe_b64encode(json.dumps({'role': 'service_role'}).encode()).decode().rstrip('=')
        self.assertTrue(findings('eyJhbGciOiJIUzI1NiJ9.' + payload + '.signature'))

    def test_public_configuration_is_allowed(self):
        self.assertFalse(findings('GAME1_SUPABASE_SECRET_KEY=\nsb_publishable_' + 'x' * 24))
        self.assertFalse(findings('GAME1_SUPABASE_URL=https://example.supabase.co'))


if __name__ == '__main__':
    unittest.main()
