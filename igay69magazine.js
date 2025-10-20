class IGay69Magazine extends ComicSource {
    name = "IGay69 Magazine";
    key = "igay69_mag";
    version = "1.0.1";
    minAppVersion = "1.0.0";
    
    url = "https://raw.githubusercontent.com/ptus815/venera-configs/main/igay69_magazine.js";

    // 代理前缀（Workers）
    proxyBase = ""; // 填写你部署的workers地址

    
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

    
    _extractMaxPage(doc) {
        let links = doc.querySelectorAll('a');
        let maxPage = 1;
        for (let a of links) {
            let href = a?.attributes?.href;
            if (!href) continue;
           
            let m = href.match(/\/category\/magazine\/page\/(\d+)\/?/i);
            if (m && m[1]) {
                let n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxPage) maxPage = n;
            }
        }
        return maxPage;
    }

    
    _pickImgSrc(img) {
        if (!img) return null;
        let attrs = img.attributes ?? {};
        let url = attrs["data-src"] || attrs["data-lazy-src"] || attrs["src"] || "";
        if (!url) return null;
        
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("http")) return url;
        
        if (url.startsWith("/")) return "https://igay69.com" + url;
        return "https://igay69.com/" + url;
    }

    
    _findFirstImg(el) {
        return el?.querySelector?.('img') ?? null;
    }

    
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

                
                const articles = doc.querySelectorAll('article');
                const comics = [];

                for (let art of articles) {
                    
                    let titleA = art.querySelector('h2 a') || art.querySelector('a[rel="bookmark"]') || art.querySelector('a');
                    let title = titleA?.text || "";
                    let href = titleA?.attributes?.href || "";
                    if (!title || !href) continue;

                   
                    let img = this._findFirstImg(art);
                    let cover = this._pickImgSrc(img);

                    
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

    
    search = {
        enableTagsSuggestions: false,
        onTagSuggestionSelected: (namespace, tag) => {
            return `${namespace}:${tag}`;
        },
       
        load: async (keyword, option, page) => {
            return { comics: [], maxPage: 1 };
        },
    };

    
    comic = {
        
        loadInfo: async (id) => {
            const url = this.proxify(id);
            const res = await Network.get(url, {});
            const html = res.body;
            const doc = new HtmlDocument(html);

            
            let title = doc.querySelector('h1')?.text?.trim();
            if (!title) {
                
                title = doc.querySelector('.entry-title')?.text?.trim() || "MAGAZINE";
            }

            
            const chapters = { "1": "Photos" };

            
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


        loadEp: async (comicId, epId) => {
            const url = this.proxify(comicId);
            const res = await Network.get(url, {});
            const html = res.body;
            const doc = new HtmlDocument(html);

            
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

               
                const low = src.toLowerCase();
                if (low.includes("/emoji") || low.includes("data:image")) continue;

               
                if (/\.(jpg|jpeg|png|webp|gif)(\?|#|$)/i.test(low) || low.startsWith("https://i.postimg.cc/")) {
                    images.push(src);
                }
            }

            doc.dispose?.();
            return { images };
        },

        
        onImageLoad: (url, comicId, epId) => {
            // 始终通过 Workers 代理转发图片请求，规避目标站反爬/直链限制
            const finalUrl = this.proxify(url);
            let referer = 'https://igay69.com';
            try {
                const u = new URL(url);
                
                referer = u.origin || referer;
            } catch (_) {}
            return {
                url: finalUrl,
                headers: {
                    referer: referer,
                    // 可按需补充 UA/其他头：'user-agent': 'Mozilla/5.0 ...'
                },
            };
        },

        
        onThumbnailLoad: (url) => {
            let referer = 'https://igay69.com';
            try {
                const u = new URL(url);
                referer = u.origin || referer;
            } catch (_) {}
            return {
                url: this.proxify(url),
                headers: { referer: referer },
            };
        },

       
        idMatch: null,

        
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

        
        enableTagsTranslate: false,
    };
}

// 注册由 App 解析器自动完成，无需手动赋值到 ComicSource.sources
