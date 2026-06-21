# QMS AI Assistant

Plateforme intelligente et modulaire de gestion documentaire qualité (QMS). Conçue avec un système RAG hybride, elle permet une recherche ultra-précise et multimodale dans les documents QMS, la génération automatique d'AMDEC/PFMEA, et la planification d'audits ISO 9001 & IATF 16949.

## 🌟 Fonctionnalités Clés

- **Chatbot RAG Hybride Multi-sources :** Recherche dense (vectorielle via pgvector) et sparse (BM25) avec l'algorithme RRF pour une précision optimale.
- **Routage Dynamique (Local/Cloud) :** Bascule instantanée entre des modèles open-source hébergés localement (Ollama) pour une confidentialité totale, et des modèles cloud (OpenAI/Groq) pour des performances de pointe.
- **Multimodalité Vocale :** Prise en charge des entrées vocales via Whisper (local ou API cloud).
- **Sécurité et Contrôle d'Accès :** Gestion granulaire des droits avec Row Level Security (RLS) en cascade dans PostgreSQL selon la criticité des documents (Low/Medium/High).
- **Génération Automatique de Livrables Qualité :** Création à la volée de matrices PFMEA, de plans d'audit, et mode de vérification documentaire (Verify).
- **Garde Anti-Hallucination :** Score de confiance dynamique limitant strictement les réponses inventées par l'IA en l'absence de sources vérifiées.

## 🏗️ Architecture & Stack Technologique

Ce projet s'appuie sur le framework robuste **MakerKit** et intègre les technologies suivantes :

- **Frontend & API :** Next.js 15 (App Router), TypeScript, Tailwind CSS v4.
- **Base de données & Vecteurs :** Supabase (PostgreSQL), extension `pgvector` pour le stockage sémantique et `pg_trgm` pour la recherche textuelle.
- **Modèles IA :** Ollama (LLaMA 3, Mistral, nomic-embed-text) pour l'approche On-Premise, Groq / OpenAI pour l'approche Cloud.
- **Audio & Transcription :** Faster-Whisper (local) ou API OpenAI Whisper.
- **Ingestion & Parsing :** `pdf-parse`, `mammoth` (Word).

## 📋 Prérequis

Avant de démarrer, assurez-vous d'avoir installé les outils suivants sur votre environnement de développement :

- **Node.js** (v18+) et **pnpm** (gestionnaire de paquets recommandé).
- **Docker Desktop** (nécessaire pour exécuter Supabase localement).
- **Supabase CLI** (`npm install -g supabase`).
- **Ollama** (si vous comptez utiliser le mode de déploiement local `local`).

## 🚀 Installation et Lancement

Suivez ces étapes pour installer et lancer la plateforme QMS AI Assistant sur votre machine locale.

### 1. Cloner le projet et installer les dépendances

```bash
git clone <URL_DU_DEPOT>
cd <NOM_DU_DOSSIER>
pnpm install
```

### 2. Démarrer Supabase en local

La base de données, l'authentification et le bucket de stockage sont gérés par l'environnement local Supabase.

```bash
npx supabase start
```

*Remarque : Cette commande appliquera automatiquement toutes les migrations (schémas, extensions pgvector, RLS) situées dans `supabase/migrations/`.*

### 3. Configurer les variables d'environnement

Créez un fichier `.env.local` à la racine du projet en vous basant sur l'exemple fourni.

```bash
cp .env.example .env.local
```

Remplissez les clés requises dans `.env.local`, notamment les clés de l'API Supabase locale (fournies dans le terminal après le `supabase start`) et votre `OPENAI_API_KEY` (si vous testez le mode cloud).

### 4. Lancer le serveur de développement

```bash
pnpm dev
```

L'application sera accessible sur [http://localhost:3000](http://localhost:3000).

## 🛠️ Build & Compilation

Pour vérifier les types et builder le projet pour la production :

```bash
pnpm build
```

---
*Ce projet a été développé dans le cadre de la construction d'un système intelligent et sécurisé dédié à l'industrie 4.0 et au management de la qualité.*
