"""Small supplemental working-tree secret check; does not scan Git history."""
import base64
import json
from pathlib import Path
import re
import subprocess
import sys

PATTERNS = {
    'private key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----'),
    'Supabase secret key': re.compile(r'\bsb_secret_[A-Za-z0-9_-]{16,}\b'),
    'GitHub token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'AWS access key': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'database URL password': re.compile(r'postgres(?:ql)?://[^\s:/]+:[^\s@]+@', re.I),
}
JWT = re.compile(r'\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b')


def findings(text):
    issues = [name for name, pattern in PATTERNS.items() if pattern.search(text)]
    for token in JWT.findall(text):
        try:
            payload = token.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            if isinstance(claims, dict) and claims.get('role') == 'service_role':
                issues.append('service_role JWT')
        except (ValueError, UnicodeDecodeError):
            pass
    return issues


def main():
    root = Path(__file__).resolve().parents[1]
    paths = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root
    ).decode('utf-8').split('\0')
    failures = []
    for name in sorted(set(filter(None, paths))):
        path = root / name
        if path.is_symlink():
            failures.append((name, 'symlink needs manual security review'))
            continue
        if not path.is_file():
            continue
        if path.name.startswith('.env') and not path.name.endswith('.example'):
            failures.append((name, 'environment file must not be tracked'))
        content = path.read_bytes().decode('utf-8', errors='replace')
        failures.extend((name, issue) for issue in findings(content))
    for name, issue in failures:
        print(f'{name}: {issue}')  # Do not print the matched secret.
    print('game1 secrets check: ' + ('FAIL' if failures else 'PASS'))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
