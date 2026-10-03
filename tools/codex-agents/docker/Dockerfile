FROM node:22-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl jq ripgrep \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @openai/codex

COPY agent-run.sh /usr/local/bin/agent-run
COPY coordinator-run.sh /usr/local/bin/coordinator-run
RUN chmod +x /usr/local/bin/agent-run /usr/local/bin/coordinator-run \
 && mkdir -p /home/node/.npm /home/node/.codex \
 && chown node:node /home/node/.npm /home/node/.codex

USER node
WORKDIR /home/node
ENTRYPOINT ["agent-run"]
