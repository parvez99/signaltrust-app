# SignalTrust

AI-powered trust infrastructure for global hiring.

SignalTrust ingests resume data (PDF or paste), normalizes it into a structured candidate profile, applies deterministic integrity signals, and produces a trust-scored report for recruiters.

The platform is designed to reduce hiring risk, accelerate decision-making, and provide repeatable, explainable signal generation.

## Current Signals (MVP)
- Overlapping roles detection
- Employment gap > 6 months
- Gap after education before first role
- Duplicate role entries
- Cross-upload duplicate resume detection

## Stack
- Cloudflare Workers
- D1 (SQLite)
- Deterministic rule engine (no LLM dependency)
- Client-side PDF extraction (pdf.js)

## Status
MVP live. Focused on recruiter workflow and repeatable signal generation.
