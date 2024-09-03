import axios from "axios";
import "colors";
import { input, select } from "@inquirer/prompts";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import Database from "better-sqlite3";
import env from "./env";
import { HttpsProxyAgent } from "https-proxy-agent";
const db = new Database("accounts.db");

const BASE_URL = "https://tg-bot-tap.laborx.io";

const ensureTableExists = () => {
	const tableExists = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='accounts';",
		)
		.get();

	if (!tableExists) {
		db.prepare(`
            CREATE TABLE accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phoneNumber TEXT,
                session TEXT,
                proxy TEXT
            );
        `).run();
	}
};

const _headers = {
	"content-type": "application/json",
	accept: "*/*",
	"sec-fetch-site": "cross-site",
	"accept-encoding": "gzip, deflate",
	"accept-language": "en-US,en;q=0.9",
	"sec-fetch-mode": "cors",
	origin: "https://timefarm.app",
	"user-agent":
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
	"sec-fetch-dest": "empty",
	"User-Agent":
		"Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
};

const createSession = async (phoneNumber: string, proxy: string) => {
	try {
		const client = new TelegramClient(
			new StringSession(""),
			env.APP_ID,
			env.API_HASH,
			{
				deviceModel: env.DEVICE_MODEL,
				connectionRetries: 5,
			},
		);

		await client.start({
			phoneNumber: async () => phoneNumber,
			password: async () => await input({ message: "Enter your password:" }),
			phoneCode: async () =>
				await input({ message: "Enter the code you received:" }),
			onError: (err: Error) => {
				if (
					!err.message.includes("TIMEOUT") &&
					!err.message.includes("CastError")
				) {
					console.log(`Telegram authentication error: ${err.message}`.red);
				}
			},
		});

		console.log("Successfully created a new session!".green);
		const stringSession = client.session.save() as unknown as string;

		db.prepare(
			"INSERT INTO accounts (phoneNumber, session, proxy) VALUES (@phoneNumber, @session, @proxy)",
		).run({ phoneNumber, session: stringSession, proxy });

		await client.sendMessage("me", {
			message: "Successfully created a new session!",
		});
		console.log("Saved the new session to session file.".green);
		await client.disconnect();
		await client.destroy();
	} catch (e) {
		const error = e as Error;
		if (
			!error.message.includes("TIMEOUT") &&
			!error.message.includes("CastError")
		) {
			console.log(`Error: ${error.message}`.red);
		}
	}
};

const showAllAccounts = () => {
	const stmt = db.prepare("SELECT phoneNumber, proxy FROM accounts");
	for (const row of stmt.iterate()) {
		console.log(row);
	}
};

const getQueryId = async (phoneNumber: string, session: string) => {
	const client = new TelegramClient(
		new StringSession(session),
		env.APP_ID,
		env.API_HASH,
		{
			deviceModel: env.DEVICE_MODEL,
			connectionRetries: 5,
		},
	);

	await client.start({
		phoneNumber: async () => phoneNumber,
		password: async () => await input({ message: "Enter your password:" }),
		phoneCode: async () =>
			await input({ message: "Enter the code you received:" }),
		onError: (err: Error) => {
			if (
				!err.message.includes("TIMEOUT") &&
				!err.message.includes("CastError")
			) {
				console.log(`Telegram authentication error: ${err.message}`.red);
			}
		},
	});

	try {
		const webview = await client.invoke(
			new Api.messages.RequestWebView({
				peer: await client.getInputEntity("TimeFarmCryptoBot"),
				bot: await client.getInputEntity("TimeFarmCryptoBot"),
				platform: "ios",
				fromBotMenu: false,
				url: "https://timefarm.app",
				startParam: "TKihhfNG855996VF",
			}),
		);

		if (!webview || !webview.url) {
			console.log("Failed to get webview URL.".red);
			return;
		}
		const query = decodeURIComponent(
			webview.url.split("&tgWebAppVersion=")[0].split("#tgWebAppData=")[1],
		);

		return query;
	} catch (e) {
		console.log(`Error retrieving query data: ${(e as Error).message}`.red);
	} finally {
		await client.disconnect();
		await client.destroy();
	}
};

const getRandomInt = (min: number, max: number) =>
	Math.floor(Math.random() * (max - min + 1)) + min;

const extractUserData = (queryId: string) => {
	const urlParams = new URLSearchParams(queryId);
	const user = JSON.parse(decodeURIComponent(urlParams.get("user") ?? ""));
	return {
		extUserId: user.id,
		extUserName: user.username,
	};
};

const getAccessToken = async (
	prefix: string,
	queryId: string,
	proxy: string,
) => {
	try {
		const url = `${BASE_URL}/api/v1/auth/validate-init/v2`;
		const headers = {
			..._headers,
		};
		const payload = {
			initData: queryId,
			platform: "ios",
		};

		const response = await axios.post(
			url,
			payload,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);

		return response.data.token;
	} catch (error) {
		console.error(prefix, "Eerror while getting Access Token:", error);
		throw error;
	}
};

const getFarmInfo = async (prefix: string, token: string, proxy: string) => {
	try {
		const url = `${BASE_URL}/api/v1/farming/info`;
		const headers = {
			..._headers,
			authorization: `Bearer ${token}`,
		};

		const response = await axios.get(
			url,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		return response?.data;
	} catch (error) {
		console.error(prefix, "Error while getting farming info", error);
		throw error;
	}
};

const getBalance = async (prefix: string, token: string, proxy: string) => {
	try {
		const url = `${BASE_URL}/api/v1/balance`;
		const headers = {
			..._headers,
			authorization: `Bearer ${token}`,
		};

		const response = await axios.get(
			url,
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		return response?.data;
	} catch (error) {
		console.error(prefix, "Error while getting balance", error);
		throw error;
	}
};

const claimFarming = async (prefix: string, token: string, proxy: string) => {
	try {
		const url = `${BASE_URL}/api/v1/balance`;
		const headers = {
			..._headers,
			authorization: `Bearer ${token}`,
		};

		const response = await axios.post(
			url,
			{},
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		return response?.data;
	} catch (error) {
		console.error(prefix, "Error while claim farming", error);
		throw error;
	}
};

const startFarming = async (prefix: string, token: string, proxy: string) => {
	try {
		const url = `${BASE_URL}/api/v1/farming/start`;
		const headers = {
			..._headers,
			authorization: `Bearer ${token}`,
		};

		const response = await axios.post(
			url,
			{},
			proxy ? { headers, httpsAgent: new HttpsProxyAgent(proxy) } : { headers },
		);
		return response?.data;
	} catch (error) {
		console.error(prefix, "Error while start farming", error);
		throw error;
	}
};

const farm = async (account: {
	phoneNumber: string;
	session: string;
	proxy: string;
}) => {
	const { phoneNumber, session, proxy } = account;
	const queryId = await getQueryId(phoneNumber, session);

	if (!queryId) {
		console.log(`Failed to get query data for ${phoneNumber}`.red);
		return;
	}

	const { extUserId } = extractUserData(queryId);
	const prefix = `[${extUserId}]`.blue;

	while (true) {
		try {
			const token = await getAccessToken(prefix, queryId, proxy);

			let farmInfo = await getFarmInfo(prefix, token, proxy);
			const balance = await getBalance(prefix, token, proxy);
			console.log(prefix, "Balance:".green, balance.balance);

			let sleepTime = 5 * 60 * 1e3;
			const currentTime = Math.floor(Date.now() / 1000);
			if (farmInfo.activeFarmingStartedAt && farmInfo.farmingReward) {
				let farmingTime = Math.floor(
					new Date(farmInfo?.activeFarmingStartedAt).getTime() / 1000 +
						farmInfo?.farmingReward,
				);

				if (farmingTime < currentTime) {
					const resultClaim = await claimFarming(prefix, token, proxy);
					if (resultClaim) {
						console.info(
							prefix,
							"🎉 Claimed farming reward".green,
							"|",
							"Balance:",
							resultClaim.balance,
						);
					}
					await startFarming(prefix, token, proxy);

					farmInfo = await getFarmInfo(prefix, token, proxy);
					farmingTime = Math.floor(
						new Date(farmInfo.activeFarmingStartedAt).getTime() / 1000 +
							farmInfo.farmingReward,
					);

					sleepTime =
						farmingTime - currentTime > 0 ? farmingTime - currentTime : 0;
					console.info(
						prefix,
						"🤖 Started farming".green,
						"|",
						"Ends in:",
						sleepTime / 60,
						"minutes",
					);
				} else {
					sleepTime =
						farmingTime - currentTime > 0 ? farmingTime - currentTime : 0;
					console.info(prefix, "🤖 Farming ends in", sleepTime / 60, "minutes");
				}
			} else {
				await startFarming(prefix, token, proxy);
				farmInfo = await getFarmInfo(prefix, token, proxy);

				const farmingTime = Math.floor(
					new Date(farmInfo.activeFarmingStartedAt).getTime() / 1000 +
						farmInfo.farmingReward,
				);

				sleepTime =
					farmingTime - currentTime > 0 ? farmingTime - currentTime : 0;

				console.info(
					prefix,
					"🤖 Started farming".green,
					"|",
					"Ends in:",
					sleepTime / 60,
					"minutes",
				);
			}

			await new Promise((res) => setTimeout(res, sleepTime * 1000));
		} catch (e) {
			const error = e as Error & { code?: string };
			console.log(
				prefix,
				`${"Error farm:".red} ${error.code} ${error.message}`,
			);
			await new Promise((res) => setTimeout(res, 5 * 60 * 1e3));
		}
	}
};

const start = async () => {
	const stmt = db.prepare("SELECT phoneNumber, session, proxy FROM accounts");
	const accounts = [...stmt.iterate()] as {
		phoneNumber: string;
		session: string;
		proxy: string;
	}[];

	await Promise.all(accounts.map(farm));
};

(async () => {
	ensureTableExists();

	while (true) {
		const mode = await select({
			message: "Please choose an option:",
			choices: [
				{
					name: "Start farming",
					value: "start",
					description: "Start playing game",
				},
				{
					name: "Add account",
					value: "add",
					description: "Add new account to DB",
				},
				{
					name: "Show all accounts",
					value: "show",
					description: "show all added accounts",
				},
			],
		});

		switch (mode) {
			case "add": {
				const phoneNumber = await input({
					message: "Enter your phone number (+):",
				});

				const proxy = await input({
					message:
						"Enter proxy (in format http://username:password@host:port):",
				});

				await createSession(phoneNumber, proxy);
				break;
			}
			case "show": {
				showAllAccounts();
				break;
			}
			case "start": {
				await start();
				break;
			}
			default:
				break;
		}
	}
})();
