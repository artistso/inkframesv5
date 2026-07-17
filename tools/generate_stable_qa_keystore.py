#!/usr/bin/env python3
"""Generate InkFrame's intentionally public, deterministic QA signing keystore.

This identity is restricted to com.inkframe.studio.qa. It is not a secret and must
never be used for production or Google Play signing.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import math
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

SEED = b"InkFrame stable public QA signing identity v1"
E = 65537
SMALL_PRIMES = (
    3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61,
    67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131,
    137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197,
    199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271,
    277, 281, 283, 293, 307, 311,
)


def candidate(label: bytes, counter: int, bits: int) -> int:
    raw = hashlib.shake_256(SEED + b"/" + label + counter.to_bytes(8, "big")).digest(bits // 8)
    value = int.from_bytes(raw, "big")
    value |= 1
    value |= 1 << (bits - 1)
    value |= 1 << (bits - 2)
    return value


def is_probable_prime(n: int, label: bytes) -> bool:
    if n < 2:
        return False
    for p in SMALL_PRIMES:
        if n == p:
            return True
        if n % p == 0:
            return False

    d = n - 1
    s = 0
    while d % 2 == 0:
        s += 1
        d //= 2

    for i in range(48):
        digest = hashlib.sha512(SEED + b"/mr/" + label + i.to_bytes(4, "big")).digest()
        a = 2 + (int.from_bytes(digest, "big") % (n - 3))
        x = pow(a, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(s - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def deterministic_prime(label: bytes, bits: int = 1024) -> int:
    counter = 0
    while True:
        value = candidate(label, counter, bits)
        if math.gcd(value - 1, E) == 1 and is_probable_prime(value, label + counter.to_bytes(8, "big")):
            return value
        counter += 1


def build_private_key() -> rsa.RSAPrivateKey:
    p = deterministic_prime(b"p")
    q = deterministic_prime(b"q")
    if p == q:
        raise RuntimeError("deterministic RSA primes unexpectedly matched")
    if p < q:
        p, q = q, p
    phi = (p - 1) * (q - 1)
    d = pow(E, -1, phi)
    numbers = rsa.RSAPrivateNumbers(
        p=p,
        q=q,
        d=d,
        dmp1=d % (p - 1),
        dmq1=d % (q - 1),
        iqmp=pow(q, -1, p),
        public_numbers=rsa.RSAPublicNumbers(E, p * q),
    )
    return numbers.private_key()


def build_certificate(key: rsa.RSAPrivateKey) -> x509.Certificate:
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "InkFrame QA"),
        x509.NameAttribute(NameOID.ORGANIZATIONAL_UNIT_NAME, "Public Test Signing"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "InkFrame"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Aberdeen"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Washington"),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
    ])
    serial = int.from_bytes(hashlib.sha256(SEED + b"/serial").digest()[:20], "big") >> 1
    return (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(serial)
        .not_valid_before(dt.datetime(2025, 1, 1, tzinfo=dt.timezone.utc))
        .not_valid_after(dt.datetime(2125, 1, 1, tzinfo=dt.timezone.utc))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=True,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=None,
                decipher_only=None,
            ),
            critical=True,
        )
        .sign(key, hashes.SHA256())
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--password", default="inkframe-qa-release")
    args = parser.parse_args()

    key = build_private_key()
    certificate = build_certificate(key)
    payload = pkcs12.serialize_key_and_certificates(
        name=b"inkframe-qa",
        key=key,
        cert=certificate,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(args.password.encode("utf-8")),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(payload)

    fingerprint = certificate.fingerprint(hashes.SHA256()).hex().upper()
    print(":".join(fingerprint[i : i + 2] for i in range(0, len(fingerprint), 2)))


if __name__ == "__main__":
    main()
