# <img width="22" height="22" alt="maskable-192" src="https://github.com/user-attachments/assets/5a806de1-f7a2-4f56-863c-91a5b6e1b89a" /> vuzon

<img width="205" height="152" alt="1-clean" src="https://github.com/user-attachments/assets/16fff53a-075e-4316-85ae-6ef7cf0fc0f3" />

<img width="205" height="152" alt="2-clean" src="https://github.com/user-attachments/assets/3ce48068-8db5-47a2-87cb-83791ca2d5bc" />

<img width="205" height="152" alt="3-clean" src="https://github.com/user-attachments/assets/2576cc6e-f137-4436-9a4a-0857329d9ee7" />


**vuzon** es una UI ligera que usa la **API de Cloudflare Email Routing** para crear y gestionar **alias** y **destinatarios** de forma sencilla.

- 🚀 **Autohospedaje**: despliega tu propia instancia con **Docker Compose**.
- ☁️ **Servicio oficial**: también puedes usar https://vuzon.cc/ (actualmente **beta cerrada**).
- 🧩 Backend en **Node/Express** con proxy a los endpoints de Cloudflare.

> Qué es Email Routing: https://developers.cloudflare.com/email-routing/

---

## Tabla de contenidos
- [Características](#características)
- [Requisitos](#requisitos)
- [Variables de entorno](#variables-de-entorno)
- [Despliegue con Docker Compose](#despliegue-con-docker-compose)
  - [Opción A: con *reverse proxy* (compose incluido)](#opción-a-con-reverse-proxy-compose-incluido)
  - [Opción B: local sencillo (puerto-3000)](#opción-b-local-sencillo-puerto-3000)
- [Ejecución local sin Docker](#ejecución-local-sin-docker)
- [Rutas del backend](#rutas-del-backend)
- [Uso básico](#uso-básico)
- [Seguridad](#seguridad)
- [Licencia](#licencia)

---

## Características
- Crear **alias/reglas** que enrutan correos a **destinatarios verificados**.
- Listado y gestión de **destinatarios** (añadir/eliminar).
- **Habilitar/Deshabilitar** reglas desde la UI.
- **Activar Email Routing** en la zona (añade/bloquea MX y SPF requeridos).
- UI responsive y PWA (manifest + iconos).

---

## Requisitos
- Un dominio en Cloudflare con **Email Routing** disponible.
- Un **API Token** de Cloudflare con permisos mínimos (ver **Seguridad**).
- Docker (para despliegue con Compose) o Node.js ≥ 18 (para ejecución local).

---

## Variables de entorno

Crea un `.env` en la raíz del proyecto:

```env
# === Cloudflare Email Routing ===
CF_API_TOKEN=your-cloudflare-api-token
CF_ACCOUNT_ID=your-cloudflare-account-id
CF_ZONE_ID=your-cloudflare-zone-id

# === App ===
NODE_ENV=production
PORT=3000
BASE_URL=https://vuzon.example.com

# Dominio gestionado por Cloudflare Email Routing
DOMAIN=example.com
```

---

## Despliegue con Docker Compose

### Opción A: con *reverse proxy* (compose incluido)

El repo incluye un `docker-compose.yml` listo para conectarlo a una red `proxy` (Traefik/Caddy/Nginx):

```yaml
services:
  app:
    container_name: vuzon
    build: ./app
    env_file: .env
    restart: unless-stopped
    expose:
      - "3000"
    networks:
      - proxy

networks:
  proxy:
    external: true
```

> Crea la red si no existe:
>
> ```bash
> docker network create proxy
> ```
>
> Publica el servicio por tu *reverse proxy* (host rule, TLS, auth, etc.).

### Opción B: local sencillo (puerto 3000)

Si prefieres exponer directamente el puerto:

```yaml
services:
  vuzon:
    build: .
    env_file: .env
    ports:
      - "3000:3000"
    restart: unless-stopped
```

**Levantar:**

```bash
docker compose up -d --build
# Abre http://localhost:3000
```

---

## Ejecución local sin Docker

```bash
npm install
npm start
# App en http://localhost:3000
```

> Requiere Node.js ≥ 18.

---

## Rutas del backend

El backend expone un proxy REST hacia Cloudflare:

- `GET  /api/addresses` — Lista destinatarios.
- `POST /api/addresses` — Crea destinatario `{ email }`.
- `DELETE /api/addresses/:id` — Elimina destinatario.

- `GET  /api/rules` — Lista reglas/alias.
- `POST /api/rules` — Crea regla `{ localPart, destEmail }`.
- `DELETE /api/rules/:id` — Elimina regla.
- `POST /api/rules/:id/enable` — Habilita regla.
- `POST /api/rules/:id/disable` — Deshabilita regla.

- `POST /api/enable-routing` — Activa Email Routing en la zona (añade/bloquea MX y SPF).

> Referencias de API (Cloudflare): reglas, direcciones y activación DNS en la documentación oficial.

---

## Uso básico

1. **Activa Email Routing** en tu zona (desde la UI o dashboard de Cloudflare).  
2. Añade una **dirección de destino** (se enviará un correo de verificación).  
3. Crea un **alias (regla)** eligiendo *local-part* y el **destino verificado**.

---

## Seguridad

- Usa **API Tokens** con **privilegios mínimos** en lugar de la Global API Key.
- Ubica la app tras un *reverse proxy* con **TLS** y, si procede, añade **autenticación**.
- No subas el archivo `.env` al repositorio.

**Scopes mínimos sugeridos para el token:**
- **Account → Email Routing Addresses: Read & Edit**
- **Zone → Email Routing Rules: Read & Edit**
- **Zone → Email Routing DNS: Edit** (solo si vas a activar Email Routing por API)

---

## Licencia

Este repositorio se publica por defecto bajo **PolyForm Noncommercial 1.0.0** (uso **no comercial** permitido).  
Para **uso comercial/empresarial**, contacta para una licencia comercial.

- Archivo: `LICENSE` con el texto de **PolyForm Noncommercial 1.0.0**.  
- Identificador SPDX: `PolyForm-Noncommercial-1.0.0`.
