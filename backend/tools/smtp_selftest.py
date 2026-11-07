#!/usr/bin/env python3
"""Test ponctuel d'envoi SMTP MX Plan, exclusivement vers la meme boite.

Aucun mot de passe n'apparait dans la commande ou dans GitHub.
La boite email reste le seul destinataire. Aucune donnee RH n'est utilisee.
Ce script ne configure pas l'envoi automatique de l'application.
"""

from __future__ import annotations

import os
import smtplib
import ssl
import stat
from email.message import EmailMessage
from pathlib import Path

SMTP_HOST = "smtp.mail.ovh.net"
SMTP_PORT = 465
SMTP_USER = "contact@cse-educatif-rxtg.fr"
SECRET_PATH = Path("/srv/cse-educatif/secrets/smtp_password")


def read_private_password() -> str:
    info = SECRET_PATH.lstat()  # Refuse egalement les liens symboliques.
    if not stat.S_ISREG(info.st_mode):
        raise ValueError("Le secret doit etre un fichier ordinaire.")
    if stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError("Le secret doit avoir les permissions 600.")
    if info.st_uid != os.geteuid():
        raise ValueError("Le secret doit appartenir a l'utilisateur courant.")
    password = SECRET_PATH.read_text(encoding="utf-8").rstrip("\r\n")
    if not password:
        raise ValueError("Le fichier de mot de passe est vide.")
    return password


def make_message() -> EmailMessage:
    message = EmailMessage()
    message["From"] = f"CSE Educatif <{SMTP_USER}>"
    message["To"] = SMTP_USER
    message["Subject"] = "CSE Educatif - test technique SMTP depuis le VPS"
    message.set_content(
        "Bonjour,\n\n"
        "Ceci est un test technique d'envoi depuis le VPS CSE Educatif "
        "via le serveur SMTP OVHcloud.\n"
        "Il ne contient aucune information sur un salarie.\n\n"
        "Aucune inscription ni notification automatique n'a ete activee.\n"
    )
    return message


def main() -> int:
    try:
        password = read_private_password()
    except (OSError, UnicodeError, ValueError):
        print("ECHEC : fichier SMTP prive absent ou permissions incorrectes.")
        return 1

    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2

    try:
        with smtplib.SMTP_SSL(
            SMTP_HOST, SMTP_PORT, timeout=20, context=context
        ) as connection:
            connection.login(SMTP_USER, password)
            connection.send_message(
                make_message(), from_addr=SMTP_USER, to_addrs=[SMTP_USER]
            )
    except smtplib.SMTPAuthenticationError as error:
        print(f"ECHEC : identifiants SMTP refuses (code {error.smtp_code}).")
        return 1
    except (smtplib.SMTPException, ssl.SSLError, OSError, TimeoutError):
        print("ECHEC : la connexion ou l'envoi SMTP a echoue.")
        return 1

    print("OK : email de test remis au serveur SMTP OVHcloud.")
    print("Destinataire unique : " + SMTP_USER)
    print("Verifiez sa reception dans le webmail de cette boite.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
