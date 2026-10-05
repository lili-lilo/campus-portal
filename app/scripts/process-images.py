#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""明德大学 · seed 图片批处理（M6 视觉改造）
============================================================================
输入：app/public/uploads/seed/ 根目录下的 47 张 PNG（按 ID 命名：H1 H2 … T10）
输出：app/public/uploads/seed/{carousel,dept,leader,news,other}/ 下 118 个文件
      （覆盖 seed 需要的 120 个路径；2 个视频位按设计留空，见 --dry-run 摘要）

做四件事：
  1. PNG → JPEG(q88, 4:2:2, progressive)：537 MB → 约 15 MB
  2. 按 ID 前缀裁到目标尺寸（居中裁；H5 保天空；B 组偏上保建筑）
  3. 统一轻微冷调（向品牌深藏青 #0b2d5e 偏），H1 加得更重
  4. H1 在「背景校名石」上合成金色「明德大学」+ 校徽（含阴影/暗角）

用法：
  python app/scripts/process-images.py --dry-run    # 只打印计划，不写任何文件
  python app/scripts/process-images.py              # 真正落盘

依赖：Pillow（本机 anaconda 已具备）。**不依赖 node 图像库**（sharp/jimp 均未安装）。
生成物在 .gitignore 排除的 /public/uploads/ 下，不进仓库；本脚本本身进仓库。
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageStat

# ---------------------------------------------------------------- 路径与常量
APP = Path(__file__).resolve().parents[1]          # app/
SEED = APP / "public" / "uploads" / "seed"         # app/public/uploads/seed
QUALITY = 88

# 品牌色
NAVY = (11, 45, 94)      # #0b2d5e
GOLD = (201, 169, 97)    # #c9a961
GOLD_DARK = (74, 56, 20)

# 每个 ID 前缀的目标尺寸 + 裁切重心（0=顶/左，0.5=居中，1=底/右）
TARGET = {
    "H": (1920, 1080, 0.50),
    "N": (1200, 750, 0.50),
    "S": (1200, 750, 0.50),
    "L": (1200, 1600, 0.50),
    "T": (1200, 1600, 0.50),
    "C": (1600, 1200, 0.50),
    "B": (1920, 960, 0.30),   # banner：偏上，保住建筑与天空
    "D": (1600, 1000, 0.50),
}
ID_OVERRIDE = {
    "H5": dict(bias=0.05),    # 8192×8192 方图 → 保天空（裁掉前景人群）
}

# 冷调强度（0-0.2 区间）：普通 0.05，H1 更重
GRADE = {"H1": 0.115}
GRADE_DEFAULT = 0.05

FONT_CANDIDATES = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
    "C:/Windows/Fonts/simsun.ttc",
]

# H1 校名石（在最终 1920×1080 坐标系里量得）
H1_PLAQUE = dict(x0=862, y0=804, x1=1058, y1=850, text_cx=958, text_cy=826)


# ---------------------------------------------------------------- 基础工具
def font(size: int) -> ImageFont.FreeTypeFont:
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:  # noqa: BLE001
                continue
    raise RuntimeError("找不到可用的中文字体（msyhbd/msyh/simhei/simsun）")


def cover_crop(im: Image.Image, tw: int, th: int, bias: float = 0.5, zoom: float = 1.0):
    """按 cover 语义裁到 tw:th，再缩放；zoom>1 表示裁得更紧（用于派生变体）"""
    w, h = im.size
    tr = tw / th
    if w / h > tr:
        cw, ch = int(round(h * tr)), h
    else:
        cw, ch = w, int(round(w / tr))
    if zoom > 1.0:
        cw, ch = int(cw / zoom), int(ch / zoom)
    x0 = int((w - cw) * bias)
    y0 = int((h - ch) * bias)
    return im.crop((x0, y0, x0 + cw, y0 + ch)).resize((tw, th), Image.LANCZOS)


def cool_grade(im: Image.Image, strength: float) -> Image.Image:
    """向 #0b2d5e 轻偏：降一点饱和 + 叠深藏青 + R↓B↑"""
    k = strength / 0.05                      # 以 0.05 为基准
    im = ImageEnhance.Color(im).enhance(1 - 0.02 * k)
    im = ImageEnhance.Contrast(im).enhance(1 + 0.01 * k)
    im = Image.blend(im, Image.new("RGB", im.size, NAVY), strength * 0.55)
    r, g, b = im.split()
    r = r.point(lambda v: max(0, min(255, int(v * (1 - 0.020 * k)))))
    g = g.point(lambda v: max(0, min(255, int(v * (1 - 0.006 * k)))))
    b = b.point(lambda v: max(0, min(255, int(v * (1 + 0.038 * k)))))
    return Image.merge("RGB", (r, g, b))


def vignette(im: Image.Image, strength: float = 0.16) -> Image.Image:
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse(
        [-w * 0.28, -h * 0.28, w * 1.28, h * 1.28], fill=255
    )
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.14))
    dark = Image.new("RGB", (w, h), (5, 18, 40))
    return Image.composite(im, Image.blend(im, dark, strength), mask)


# ---------------------------------------------------------------- 校徽（原生绘制）
def mark_mask(size: int) -> Image.Image:
    """按 logo-mark.svg 的几何画「日月」标识，返回 L 通道（3× 超采样抗锯齿）"""
    ss = 3
    S = size * ss
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    s = S / 256.0

    def X(v):
        return (v) * s

    def Y(v):
        return (v) * s

    bb = [X(66), Y(66), X(190), Y(190)]                    # r=62 外接框（SVG 坐标系）
    disc = Image.new("L", (S, S), 0)
    ImageDraw.Draw(disc).chord(bb, 90, 270, fill=255)      # 左半圆
    bands = Image.new("L", (S, S), 0)
    bd = ImageDraw.Draw(bands)
    for y1, y2 in ((66, 104), (110, 146), (152, 190)):
        bd.rectangle([0, Y(y1), S, Y(y2)], fill=255)
    sun = ImageChops.darker(disc, bands)                   # 交集 = 三段横带
    rays = Image.new("L", (S, S), 0)
    rd = ImageDraw.Draw(rays)
    for deg in (120, 150, 180, 210, 240):
        a = math.radians(deg)
        rd.line(
            [X(128 + 68 * math.cos(a)), Y(128 + 68 * math.sin(a)),
             X(128 + 80 * math.cos(a)), Y(128 + 80 * math.sin(a))],
            fill=255, width=max(2, int(4.4 * s)),
        )
    sun = ImageChops.lighter(sun, rays)
    half = Image.new("L", (S, S), 0)
    ImageDraw.Draw(half).chord(bb, 270, 90, fill=255)      # 右半圆
    cut = Image.new("L", (S, S), 0)
    ImageDraw.Draw(cut).ellipse([X(8.05), Y(52), X(160.05), Y(204)], fill=255)
    moon = ImageChops.darker(half, ImageChops.invert(cut))  # 右半圆 − 内弧圆 = 弯月
    return ImageChops.lighter(sun, moon).resize((size, size), Image.LANCZOS)


def gold_mark(size: int) -> Image.Image:
    mk = Image.new("RGBA", (size, size), GOLD + (0,))
    mk.putalpha(mark_mask(size))
    return mk


# ---------------------------------------------------------------- H1 合成校名
def composite_h1(img: Image.Image) -> Image.Image:
    p = H1_PLAQUE
    px0, py0, px1, py1 = p["x0"], p["y0"], p["x1"], p["y1"]

    # ① 抹掉石面上原来的字：取该区域 → 强模糊 + 与均值色混合 → 软边贴回
    region = img.crop((px0, py0, px1, py1))
    blur = region.filter(ImageFilter.GaussianBlur(7))
    avg = ImageStat.Stat(blur).mean
    tint = Image.new("RGB", region.size, (int(avg[0]), int(avg[1]), int(avg[2])))
    patch = Image.blend(blur, tint, 0.45)
    w, h = region.size
    edge = Image.new("L", (w, h), 0)
    ImageDraw.Draw(edge).rounded_rectangle([1, 1, w - 2, h - 2], radius=6, fill=255)
    edge = edge.filter(ImageFilter.GaussianBlur(3))
    img.paste(patch, (px0, py0), edge)

    # ② 金色「明德大学」+ 校徽，带阴影（像漆/嵌在校名石上）
    size = 30
    f = font(size)
    tmp = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    tw = int(tmp.textlength("明德大学", font=f))
    mh = int(size * 1.05)
    gap = 7
    total = mh + gap + tw
    x0 = int(p["text_cx"] - total / 2)
    y_center = p["text_cy"]
    y_text = int(y_center - size * 0.62)

    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    # 阴影（偏移 + 高斯模糊）
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.text((x0 + mh + gap + 1, y_text + 2), "明德大学", font=f, fill=(20, 12, 0, 210))
    sh = sh.filter(ImageFilter.GaussianBlur(1.6))
    layer = Image.alpha_composite(layer, sh)
    # 校徽（带阴影）
    mk = gold_mark(mh)
    msh = Image.new("RGBA", mk.size, (0, 0, 0, 0))
    msh.paste((20, 12, 0, 200), (0, 0), mk.split()[3])
    msh = msh.filter(ImageFilter.GaussianBlur(1.2))
    layer.alpha_composite(msh, (x0, int(y_center - mh / 2) + 2))
    layer.alpha_composite(mk, (x0, int(y_center - mh / 2)))
    # 金字（描边让它在石灰底上立得住）
    ld = ImageDraw.Draw(layer)
    ld.text(
        (x0 + mh + gap, y_text), "明德大学", font=f,
        fill=GOLD + (255,), stroke_width=1, stroke_fill=GOLD_DARK + (230,),
    )
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

    # ③ 平板外圈轻微压暗，避免"贴上去"的生硬感
    ring = Image.new("L", img.size, 0)
    ImageDraw.Draw(ring).rounded_rectangle(
        [px0 - 6, py0 - 5, px1 + 6, py1 + 5], radius=10, fill=255
    )
    ring = ring.filter(ImageFilter.GaussianBlur(9))
    img = Image.composite(img, Image.blend(img, Image.new("RGB", img.size, (18, 12, 4)), 0.18), ring)
    return img


# ---------------------------------------------------------------- 落盘计划
def variant(i: int) -> dict:
    """派生变体参数：换裁切位置 + 轻微色调扰动（避免与母图一模一样）"""
    return dict(
        zoom=1.06 + 0.035 * (i % 4),
        bias=0.30 + 0.11 * (i % 5),
        bright=1.0 + (0.012 if i % 3 == 0 else -0.012 if i % 3 == 1 else 0.0),
    )


def build_plan() -> list[tuple[str, str, dict | None]]:
    out: list[tuple[str, str, dict | None]] = []

    HERO = ["H1", "H2", "H3", "H4", "H5"]
    # Hero 显示顺序 = createdAt desc = image-046 → 041 → 036 → 031 → 026
    for slot, hid in zip(["046", "041", "036", "031", "026"], HERO):
        out.append((f"carousel/image-{slot}.jpg", hid, None))
    for i, slot in enumerate(["001", "006", "011", "016", "021"]):
        out.append((f"carousel/image-{slot}.jpg", HERO[i], variant(i + 1)))

    # dept：B1 是 ee 站真正取到的那张（最新 = image-048）
    for slot, hid in zip(["048", "043", "038", "033", "028", "018"], ["B1", "B2", "B3", "D1", "D2", "D3"]):
        out.append((f"dept/image-{slot}.jpg", hid, None))
    for i, slot in enumerate(["013", "008", "003"]):
        out.append((f"dept/image-{slot}.jpg", ["D1", "D2", "D3"][i], variant(i + 2)))

    # leader：L1-L6 + T1-T3（师资其余 7 张在 other/）
    for slot, hid in zip(["004", "009", "014", "019", "024", "029"], ["L1", "L2", "L3", "L4", "L5", "L6"]):
        out.append((f"leader/image-{slot}.jpg", hid, None))
    for slot, hid in zip(["039", "044", "049"], ["T1", "T2", "T3"]):
        out.append((f"leader/image-{slot}.jpg", hid, None))

    # other：T4-T10 + C4/C5 + 1 派生位
    for slot, hid in zip(["005", "010", "015", "020", "025", "030", "035"],
                         ["T4", "T5", "T6", "T7", "T8", "T9", "T10"]):
        out.append((f"other/image-{slot}.jpg", hid, None))
    for slot, hid in zip(["040", "045"], ["C4", "C5"]):
        out.append((f"other/image-{slot}.jpg", hid, None))
    out.append(("other/image-050.jpg", "C3", variant(3)))

    # news 媒体库（前台不渲染，仅后台列表）
    for slot, hid in zip(["002", "007", "012"], ["C1", "C2", "C3"]):
        out.append((f"news/image-{slot}.jpg", hid, None))
    for i, slot in enumerate(["022", "027", "032", "037", "042", "047"]):
        out.append((f"news/image-{slot}.jpg", ["N1", "N2", "N3", "S1", "S2", "S3"][i], variant(i + 1)))

    # 文章封面 cover-01..50
    # N4 缺图 → 用 S 组「体育场」S4 顶替（内容最接近"运动会/体育赛事"）
    covers = [("N1", None), ("N2", None), ("N3", None), ("S4", variant(5)),
              ("N5", None), ("N6", None)]
    for i, (hid, var) in enumerate(covers):
        out.append((f"news/cover-{i + 1:02d}.jpg", hid, var))
    for i, hid in enumerate([f"S{n}" for n in range(1, 11)]):
        out.append((f"news/cover-{i + 7:02d}.jpg", hid, None))
    pool = ["H1", "H2", "H3", "H4", "H5", "N1", "N2", "N3", "N5", "N6",
            "S1", "S4", "S6", "S8", "C1", "C2", "C4", "D1", "D3", "B1"]
    for k, n in enumerate(range(17, 51)):
        out.append((f"news/cover-{n:02d}.jpg", pool[k % len(pool)], variant(k % 6 + 1)))

    return out


# ---------------------------------------------------------------- 主流程
def main() -> int:
    # Windows 控制台默认 GBK，直接 print 非 GBK 字符会 UnicodeEncodeError
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不写文件")
    args = ap.parse_args()

    if not SEED.is_dir():
        print(f"[ERR] 找不到 {SEED}", file=sys.stderr)
        return 1

    plan = build_plan()
    missing_src = sorted({src for _, src, _ in plan if not (SEED / f"{src}.png").exists()})
    if missing_src:
        print(f"[ERR] 缺源图: {missing_src}", file=sys.stderr)
        return 1

    print(f"源目录: {SEED}")
    print(f"计划产出: {len(plan)} 张图片")
    print("另外：dept/file-023.pdf ← 复制 files/attachment-01.pdf（Media 的 file 位）")
    print("留空（按设计）：leader/video-034.mp4、news/video-017.mp4（均为无前台消费者的视频位）")
    print(f"{'目标路径':<34}{'源':<5}{'尺寸':<12}{'变体'}")
    for rel, src, var in plan:
        pre = src[0]
        w, h, bias = TARGET[pre]
        v = "母图" if var is None else f"zoom={var['zoom']:.2f} bias={var['bias']:.2f}"
        print(f"{rel:<34}{src:<5}{f'{w}x{h}':<12}{v}")
    if args.dry_run:
        print("\n[dry-run] 未写任何文件")
        return 0

    cache: dict[str, Image.Image] = {}
    total = 0
    # 按源图分组逐个处理：47 张里有 8K 图（单张解码 ~200 MB），全缓存会爆内存
    order: list[str] = []
    groups: dict[str, list[tuple[str, dict | None]]] = {}
    for rel, src, var in plan:
        if src not in groups:
            groups[src] = []
            order.append(src)
        groups[src].append((rel, var))

    for src in order:
        with Image.open(SEED / f"{src}.png") as raw:
            if raw.mode in ("RGBA", "LA", "P"):
                raw = raw.convert("RGBA")
                bg = Image.new("RGB", raw.size, (255, 255, 255))   # T7 带 alpha → 白底
                bg.paste(raw, (0, 0), raw.split()[3])
                base = bg
            else:
                base = raw.convert("RGB")

            w, h, base_bias = TARGET[src[0]]
            cfg = ID_OVERRIDE.get(src, {})
            for rel, var in groups[src]:
                bias = var["bias"] if var else cfg.get("bias", base_bias)
                img = cover_crop(base, w, h, bias=bias, zoom=(var or {}).get("zoom", 1.0))
                img = cool_grade(img, GRADE.get(src, GRADE_DEFAULT))
                if var and var.get("bright") != 1.0:
                    img = ImageEnhance.Brightness(img).enhance(var["bright"])
                # 只给母图合成校名（派生位是另一种裁切，平板坐标不再适用）
                if src == "H1" and var is None:
                    img = composite_h1(img)
                    img = vignette(img, 0.15)

                dst = SEED / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                img.save(dst, "JPEG", quality=QUALITY, subsampling=1, optimize=True, progressive=True)
                total += dst.stat().st_size
                print(f"  [ok] {rel:<32}{w}x{h}  {dst.stat().st_size:>8,} B")

    # dept 的 file 位：复制一份既有 PDF（Media.type='file' 的占位，无前台消费者）
    src_pdf = SEED / "files" / "attachment-01.pdf"
    dst_pdf = SEED / "dept" / "file-023.pdf"
    if src_pdf.exists():
        dst_pdf.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src_pdf, dst_pdf)
        print(f"  [ok] dept/file-023.pdf <- attachment-01.pdf")

    print(f"\n完成：{len(plan)} 张图片 + 1 个占位 PDF，合计 {total / 1024 / 1024:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
