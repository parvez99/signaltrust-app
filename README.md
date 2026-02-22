# SignalTrust AI Trust Engine

A deterministic resume integrity engine for recruiters.

This service ingests resume text (PDF or paste), normalizes it into a structured candidate profile, runs timeline integrity signals, and produces a trust-scored report.

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
