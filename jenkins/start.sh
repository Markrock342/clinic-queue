#!/usr/bin/env bash
# เปิด Jenkins บนเครื่องตัวเองด้วยคำสั่งเดียว (ไม่ต้องใช้ Docker)
# - ดาวน์โหลด jenkins.war และปลั๊กอินที่ต้องใช้ในครั้งแรก
# - สร้าง Pipeline job "clinic-queue" ที่ดึง Jenkinsfile จาก GitHub ให้อัตโนมัติ
# - เปิดที่ http://localhost:8080 (ฟังเฉพาะเครื่องนี้)
#
# ใช้:  ./jenkins/start.sh
# ตัวแปรที่เปลี่ยนได้: JENKINS_HOME, JENKINS_PORT, REPO_URL, JAVA_HOME
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
export JENKINS_HOME="${JENKINS_HOME:-$HOME/.clinic-queue-jenkins}"
export JENKINS_PORT="${JENKINS_PORT:-8080}"
PORT="$JENKINS_PORT"
export REPO_URL="${REPO_URL:-https://github.com/Markrock342/clinic-queue.git}"
BIN="$JENKINS_HOME/bin"

if [[ -n "${JAVA_HOME:-}" ]]; then
  JAVA="$JAVA_HOME/bin/java"
elif [[ -x /opt/homebrew/opt/openjdk@21/bin/java ]]; then
  JAVA=/opt/homebrew/opt/openjdk@21/bin/java
else
  JAVA="$(command -v java)"
fi
echo "ใช้ Java: $("$JAVA" -version 2>&1 | head -1)"

command -v node >/dev/null || { echo "ต้องติดตั้ง Node.js 20+ ก่อน" >&2; exit 1; }
echo "ใช้ Node: $(node -v)"

mkdir -p "$BIN" "$JENKINS_HOME/init.groovy.d"

if [[ ! -f "$BIN/jenkins.war" ]]; then
  echo "ดาวน์โหลด Jenkins LTS…"
  curl -fL --retry 3 -o "$BIN/jenkins.war" https://get.jenkins.io/war-stable/latest/jenkins.war
fi

if [[ ! -f "$BIN/plugin-manager.jar" ]]; then
  echo "ดาวน์โหลดตัวติดตั้งปลั๊กอิน…"
  curl -fL --retry 3 -o "$BIN/plugin-manager.jar" \
    https://github.com/jenkinsci/plugin-installation-manager-tool/releases/download/2.16.0/jenkins-plugin-manager-2.16.0.jar
fi

if [[ ! -f "$JENKINS_HOME/plugins/.installed" ]]; then
  echo "ติดตั้งปลั๊กอิน (ครั้งแรกใช้เวลาสักครู่)…"
  "$JAVA" -jar "$BIN/plugin-manager.jar" \
    --war "$BIN/jenkins.war" \
    --plugin-download-directory "$JENKINS_HOME/plugins" \
    --plugin-file "$HERE/plugins.txt"
  touch "$JENKINS_HOME/plugins/.installed"
fi

cp "$HERE"/init.groovy.d/*.groovy "$JENKINS_HOME/init.groovy.d/"

echo "เปิด Jenkins ที่ http://localhost:$PORT  (กด Ctrl+C เพื่อปิด)"
exec "$JAVA" \
  -Djenkins.install.runSetupWizard=false \
  -Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true \
  -jar "$BIN/jenkins.war" \
  --httpPort="$PORT" \
  --httpListenAddress=127.0.0.1
