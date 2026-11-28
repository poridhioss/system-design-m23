# system-design-m23 — Lab 1 complete

Finished code for **Module 23, Lab 1: Circuit Breaker & Timeouts**, as it stands at the end of the lab.

Later labs start from this branch:

```bash
git clone -b lab-01-complete --single-branch https://github.com/poridhioss/system-design-m23.git
```

## What's inside

```text
├── Dockerfile            # one image, used by all three services
├── docker-compose.yml    # shortener (port 8231) + links (port 9231) + analytics
├── package.json
├── src/
│   ├── links.js          # where each short code goes, plus a fault switch
│   ├── analytics.js      # counts clicks
│   ├── breaker.js        # opossum circuit breaker that logs its state changes
│   └── shortener.js      # redirects; PROTECTION=none|timeout|breaker, FALLBACK=none|cache
└── scripts/
    └── load.js           # 30 clicks per second, one summary line per second
```

## Run it

```bash
PROTECTION=breaker FALLBACK=cache docker compose up -d --build
docker compose exec shortener node scripts/load.js

# in a second terminal: make links slow, then heal it
curl -s -X POST http://localhost:9231/admin/fault -H "Content-Type: application/json" -d '{"delayMs": 5000}'
curl -s -X POST http://localhost:9231/admin/fault -H "Content-Type: application/json" -d '{"delayMs": 0}'
```
