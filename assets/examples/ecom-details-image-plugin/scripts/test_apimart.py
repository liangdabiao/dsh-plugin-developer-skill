#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apimart API 连通性测试：提交最小任务并轮询到完成。"""
import json
import time
import urllib.request
import urllib.error

BASE = "https://api.apimart.ai/v1"
KEY = "sk-YOUR_APIMART_KEY"


def post(url, payload):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")


def get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {KEY}"}, method="GET")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    payload = {
        "model": "gpt-image-2",
        "prompt": "a simple red apple on white background, product photo, minimal",
        "n": 1,
        "size": "1:1",
        "resolution": "1k",
    }
    r = post(BASE + "/images/generations", payload)
    print("submit code:", r.get("code"))
    if r.get("code") and r["code"] != 200:
        print("submit error:", json.dumps(r, ensure_ascii=False)[:300])
        return
    tid = r["data"][0]["task_id"]
    print("task_id:", tid)
    time.sleep(15)
    for i in range(12):
        rr = get(BASE + "/tasks/" + tid)
        d = rr.get("data", {})
        st = d.get("status")
        print("poll", i, "status=", st, "progress=", d.get("progress"))
        if st == "completed":
            imgs = d["result"]["images"]
            print("image url:", imgs[0]["url"][0])
            print("actual_time:", d.get("actual_time"), "cost:", d.get("cost"))
            return
        if st == "failed":
            print("failed:", json.dumps(d, ensure_ascii=False)[:300])
            return
        time.sleep(5)
    print("timeout after polls")


if __name__ == "__main__":
    main()
