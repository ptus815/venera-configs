class IGay69Magazine extends ComicSource {
    name = "IGay69 Magazine";
    key = "igay69_mag";
    version = "1.0.0";
    minAppVersion = "1.0.0";
    // 可留空或指向你托管此脚本的 URL
    url = "";

    // 代理前缀（Workers）
    proxyBase = "https://eason086.dpdns.org/";

    // 将真实 URL 包装为代理 URL
    proxify(url) {
        if (!url) return url;
        if (url.startsWith("http")) {
            return this.proxyBase + url;
        }
        if (url.startsWith("/")) {
            return this.proxyBase + "https://igay69.com" + url;
        }
        return this.proxyBase + "https://igay69.com/" + url;
    }

    // 解析最大页数（从分页链接中提取）
    _extractMaxPage(doc) {
        let links = doc.querySelectorAll('a');
        let maxPage = 1;
        for (let a of links) {
            let href = a?.attributes?.href;
            if (!href) continue;
            // 例如 /category/magazine/page/154/
            let m = href.match(/\/category\/magazine\/page\/(\d+)\/?/i);
            if (m && m[1]) {
                let n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxPage) maxPage = n;
            }
        }
        return maxPage;
    }

    // 取图片 URL（优先 data-src，再退回 src），并归一化为绝对 URL
    _pickImgSrc(img) {
        if (!img) return null;
        let attrs = img.attributes ?? {};
        let url = attrs["data-src"] || attrs["data-lazy-src"] || attrs["src"] || "";
        if (!url) return null;
        // 图片一般来自 i.postimg.cc 或站内 wp-content，URL 通常已是绝对链接
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("http")) return url;
        // 相对路径（少见），拼 igay69
        if (url.startsWith("/")) return "https://igay69.com" + url;
        return "https://igay69.com/" + url;
    }

    // 从元素中查找第一个 img
    _findFirstImg(el) {
        return el?.querySelector?.('img') ?? null;
    }

    // 探索页（仅一个：MAGAZINE 列表），按页抓取
    explore = [
        {
            title: "MAGAZINE",
            type: "multiPageComicList",
            load: async (page) => {
                const pageNum = Math.max(1, page || 1);
                const listUrl = pageNum === 1
                    ? "https://igay69.com/category/magazine/"
                    : `https://igay69.com/category/magazine/page/${pageNum}/`;

                const res = await Network.get(this.proxify(listUrl), {});
                const html = res.body;
                const doc = new HtmlDocument(html);

                // WordPress 列表：每条为 article
                const articles = doc.querySelectorAll('article');
                const comics = [];

                for (let art of articles) {
                    // 标题与详情链接
                    let titleA = art.querySelector('h2 a') || art.querySelector('a[rel="bookmark"]') || art.querySelector('a');
                    let title = titleA?.text || "";
                    let href = titleA?.attributes?.href || "";
                    if (!title || !href) continue;

                    // 封面
                    let img = this._findFirstImg(art);
                    let cover = this._pickImgSrc(img);

                    // 详情 id 用真实 URL，后续会 proxify 获取 HTML
                    const comic = new Comic({
                        id: href,
                        title: title,
                        cover: cover || "",
                        tags: [],
                        description: "",
                        language: "en",
                    });
                    comics.push(comic);
                }

                const maxPage = this._extractMaxPage(doc) || pageNum; // 若解析失败则至少为当前页
                doc.dispose?.();
                return { comics, maxPage };
            },
        },
    ];

    // 单本详情
    comic = {
        // 详情信息：设定一个章节“Photos”
        loadInfo: async (id) => {
            const url = this.proxify(id);
            const res = await Network.get(url, {});
            const html = res.body;
            const doc = new HtmlDocument(html);

            // 标题（回退到 h1 或 <title>）
            let title = doc.querySelector('h1')?.text?.trim();
            if (!title) {
                // 尝试文章标题常见容器
                title = doc.querySelector('.entry-title')?.text?.trim() || "MAGAZINE";
            }

            // 构造一个章节
            const chapters = { "1": "Photos" };

            // 简要封面尝试（正文第一张图作为封面）
            let firstImg = doc.querySelector('article img') || doc.querySelector('.entry-content img');
            let cover = this._pickImgSrc(firstImg) || "";

            const detail = new ComicDetails({
                title: title,
                subTitle: title,
                cover: cover,
                description: "",
                tags: {},
                chapters: chapters,
                isFavorite: null,
                thumbnails: null,   // 让阅读器通过 loadEp 载图
                recommend: null,
                commentCount: null,
                likesCount: null,
                isLiked: null,
                uploader: null,
                updateTime: null,
                uploadTime: null,
                url: id,
                stars: null,
                maxPage: null,
                comments: null,
            });

            doc.dispose?.();
            return detail;
        },

        // 载入章节图片（仅一章）
        loadEp: async (comicId, epId) => {
            const url = this.proxify(comicId);
            const res = await Network.get(url, {});
            const html = res.body;
            const doc = new HtmlDocument(html);

            // 在正文抓取所有 img（支持 data-src/src）
            const container =
                doc.querySelector('.entry-content') ||
                doc.querySelector('article') ||
                doc.querySelector('main') ||
                doc; // 兜底

            const images = [];
            const imgs = container?.querySelectorAll?.('img') || [];
            for (let im of imgs) {
                const src = this._pickImgSrc(im);
                if (!src) continue;

                // 过滤明显非正文/极小/表情/站点徽章（可按需增强）
                const low = src.toLowerCase();
                if (low.includes("/emoji") || low.includes("data:image")) continue;

                // 常见图扩展名
                if (/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(low) || low.startsWith("https://i.postimg.cc/")) {
                    images.push(src);
                }
            }

            doc.dispose?.();
            return { images };
        },

        // 针对图片请求按需调整（一般不需要）
        onImageLoad: (url, comicId, epId) => {
            // 部分站点要求 Referer，这里按需设置。postimg 通常不强制。
            // 若未来遇到 403，可在此添加 headers: { referer: "https://postimg.cc" } 等
            return {
                url: url,
                headers: {
                    // 'referer': 'https://igay69.com', // 按需启用
                    // 'user-agent': 'Mozilla/5.0 ...'  // 可省略，App 会注入 UA
                },
            };
        },

        // 正则匹配 ID（可选）
        idMatch: null,

        // 处理外部链接为 comicId（可选）
        link: {
            domains: ['igay69.com'],
            linkToId: (url) => {
                try {
                    let u = new URL(url);
                    if (u.hostname.endsWith('igay69.com')) {
                        return u.href;
                    }
                } catch (_) {}
                return null;
            }
        },

        // 标签翻译（关闭）
        enableTagsTranslate: false,
    };
}

// 注册
ComicSource.sources["igay69_mag"] = new IGay69Magazine();