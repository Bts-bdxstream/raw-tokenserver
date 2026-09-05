let token = "";
export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		
		// CORS preflight (OPTIONS) হ্যান্ডেল করুন
		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
					"Access-Control-Allow-Headers": "Range, Authorization, Content-Type",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		if (url.pathname !== '/') {
			let githubRawUrl = 'https://raw.githubusercontent.com';
			if (new RegExp(githubRawUrl, 'i').test(url.pathname)) {
				githubRawUrl += url.pathname.split(githubRawUrl)[1];
			} else {
				if (env.GH_NAME) {
					githubRawUrl += '/' + env.GH_NAME;
					if (env.GH_REPO) {
						githubRawUrl += '/' + env.GH_REPO;
						if (env.GH_BRANCH) githubRawUrl += '/' + env.GH_BRANCH;
					}
				}
				githubRawUrl += url.pathname;
			}

			// Headers তৈরি করুন
			const headers = new Headers();
			let authTokenSet = false;

			// Authorization টোকেন সেট করা (আগের মতোই)
			if (env.TOKEN_PATH) {
				const 需要鉴权的路径配置 = await ADD(env.TOKEN_PATH);
				const normalizedPathname = decodeURIComponent(url.pathname.toLowerCase());
				for (const pathConfig of 需要鉴权的路径配置) {
					const configParts = pathConfig.split('@');
					if (configParts.length !== 2) continue;
					const [requiredToken, pathPart] = configParts;
					const normalizedPath = '/' + pathPart.toLowerCase().trim();
					const pathMatches = normalizedPathname === normalizedPath ||
						normalizedPathname.startsWith(normalizedPath + '/');
					if (pathMatches) {
						const providedToken = url.searchParams.get('token');
						if (!providedToken) return new Response('TOKEN不能为空', { status: 400 });
						if (providedToken !== requiredToken.trim()) return new Response('TOKEN错误', { status: 403 });
						if (!env.GH_TOKEN) return new Response('服务器GitHub TOKEN配置错误', { status: 500 });
						headers.append('Authorization', `token ${env.GH_TOKEN}`);
						authTokenSet = true;
						break;
					}
				}
			}

			if (!authTokenSet) {
				if (env.GH_TOKEN && env.TOKEN) {
					if (env.TOKEN == url.searchParams.get('token')) token = env.GH_TOKEN || token;
					else token = url.searchParams.get('token') || token;
				} else token = url.searchParams.get('token') || env.GH_TOKEN || env.TOKEN || token;
				const githubToken = token;
				if (!githubToken || githubToken == '') {
					return new Response('TOKEN不能为空', { status: 400 });
				}
				headers.append('Authorization', `token ${githubToken}`);
			}

			// 🔥 মেইন ফিচার: Range হেডার ফরওয়ার্ড করুন (যদি থাকে)
			const rangeHeader = request.headers.get('Range');
			if (rangeHeader) {
				headers.append('Range', rangeHeader);
			}

			// 🚀 GitHub-এ রিকোয়েস্ট পাঠান (টাইমআউট বাড়িয়ে)
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 সেকেন্ড টাইমআউট

			try {
				const response = await fetch(githubRawUrl, { 
					headers, 
					signal: controller.signal,
					cf: {
						cacheTtl: 3600, // Cloudflare CDN ক্যাশ (১ ঘণ্টা)
						cacheEverything: true,
					}
				});
				clearTimeout(timeoutId);

				// 🌐 CORS হেডার তৈরি করুন
				const responseHeaders = new Headers(response.headers);
				responseHeaders.set('Access-Control-Allow-Origin', '*');
				responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');

				// 💾 ক্যাশ কন্ট্রোল (প্লেয়ারকে ক্যাশ করতে বলে)
				responseHeaders.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

				// 📦 রেঞ্জ রিকোয়েস্টের জন্য স্ট্যাটাস ঠিক করুন
				let status = response.status;
				if (rangeHeader && status === 200) {
					// GitHub যদি পুরো ফাইল দেয়, তবুও আমরা 206 দিতে পারি (যদি Content-Range থাকে)
					const contentRange = responseHeaders.get('Content-Range');
					if (contentRange) {
						status = 206; // Partial Content
					}
				}

				return new Response(response.body, {
					status: status,
					headers: responseHeaders,
				});

			} catch (error) {
				clearTimeout(timeoutId);
				if (error.name === 'AbortError') {
					return new Response('Request Timeout', { status: 504, headers: { 'Access-Control-Allow-Origin': '*' } });
				}
				return new Response('Server Error', { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
			}

		} else {
			// Homepage (nginx伪装)
			const envKey = env.URL302 ? 'URL302' : (env.URL ? 'URL' : null);
			if (envKey) {
				const URLs = await ADD(env[envKey]);
				const URL = URLs[Math.floor(Math.random() * URLs.length)];
				return envKey === 'URL302' ? Response.redirect(URL, 302) : fetch(new Request(URL, request));
			}
			return new Response(await nginx(), {
				headers: {
					'Content-Type': 'text/html; charset=UTF-8',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
	}
};

async function nginx() {
	const text = `
	<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body {
			width: 35em;
			margin: 0 auto;
			font-family: Tahoma, Verdana, Arial, sans-serif;
		}
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>
	`
	return text;
}

async function ADD(envadd) {
	var addtext = envadd.replace(/[	|"'\r\n]+/g, ',').replace(/,+/g, ',');
	if (addtext.charAt(0) == ',') addtext = addtext.slice(1);
	if (addtext.charAt(addtext.length - 1) == ',') addtext = addtext.slice(0, addtext.length - 1);
	const add = addtext.split(',');
	return add;
}
