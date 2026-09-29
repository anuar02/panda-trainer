#!/usr/bin/env bash
# Usage: gen_pose.sh <pose>   (reads prompt-<pose>.txt and keyframes/<pose>-green.png)
set -euo pipefail
P="$1"; API=https://api.higgsfield.ai; AUTH="Authorization: Key $HIGGSFIELD_API_KEY"
mkdir -p out
U=$(curl -sS -f -X POST $API/files/generate-upload-url -H "$AUTH" -H "Content-Type: application/json" -d '{"content_type":"image/png"}')
UP=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["upload_url"])' "$U")
PUB=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["public_url"])' "$U")
curl -sS -f -X PUT "$UP" -H "Content-Type: image/png" -H "x-amz-tagging: retention=temporary" --data-binary @"keyframes/$P-green.png" >/dev/null
python3 -c 'import json,sys;print(json.dumps({"prompt":open(sys.argv[1]).read().strip(),"image_url":sys.argv[2],"end_image_url":sys.argv[2],"duration":5,"aspect_ratio":"1:1"}))' "prompt-$P.txt" "$PUB" > "out/req-$P.json"
curl -sS -f -X POST $API/minimax/h3/image-to-video -H "$AUTH" -H "Content-Type: application/json" --data @"out/req-$P.json" -o "out/submit-$P.json"
echo "$P $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["status"])' "out/submit-$P.json")"
