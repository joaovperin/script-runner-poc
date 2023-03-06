import fs from "fs";
// import path from "path";
import { BrowserConnectOptions, BrowserLaunchArgumentOptions, ElementHandle, KeyInput, LaunchOptions, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { WebNavigator, ClickOptions, DelayOptions, WaitForOptions } from "./../types/web-navigator";
import { createCursor, GhostCursor } from "ghost-cursor";
import { Log } from "gudangjs";

puppeteer.use(StealthPlugin());

type Action = { id: number; priority: number; action: () => Promise<any> };

export class PuppeteerNavigator implements WebNavigator {
    private cursor: GhostCursor;
    private get cursorOptions(): any {
        return { moveDelay: 50 };
    }
    constructor (private page: Page, private browserLaunchParams?: LaunchOptions & BrowserLaunchArgumentOptions & BrowserConnectOptions) {
        this.cursor = createCursor(page);
    }

    public static async init({
        userDataDir = "/data/main",
        headless = true,
        cookies = "",
        proxy = "",
        executablePath = undefined,
        extensionPath = undefined,
        testMode = false,
    }): Promise<PuppeteerNavigator> {
        PuppeteerNavigator.protectedBrowserExecutionWhileFocused();

        console.log(`Initializing web browser '${executablePath}'`);

        const args: string[] = ["--start-maximized"];

        const [url, login] = proxy.split("@");

        if (!proxy) {
            args.push(...["--proxy-server='direct://'", "--proxy-bypass-list=*"]);
        } else {
            args.push(...[`--proxy-server=${url}`]);
        }

        if (extensionPath) {
            const __nopeCha = `${extensionPath}\\nopecha\\0.3.2_0`;
            console.log(`Loading extension '${__nopeCha}'`);
            args.push(`--load-extension=${__nopeCha}`);
        }

        // '--enable-automation'
        args.push("--enable-automation");
        // C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
        const browserLaunchParams: any = {
            executablePath,
            slowMo: 0, // slow down by 0ms
            userDataDir,
            defaultViewport: null,
            ignoreDefaultArgs: ["--disable-extensions"],
            args,
        };

        if (headless) {
            args.push("--headless=chrome");
        } else {
            browserLaunchParams.headless = false;
        }

        const browser = await puppeteer.launch(browserLaunchParams);
        const page = await browser.newPage();

        if (proxy && login) {
            const [username, password] = login.split(":");
            await page.authenticate({ username, password });
        }

        // CLOSE FIRST PAGE
        (await browser.pages())[0].close();

        // TODO: check how to make this work
        // await page.setViewport(viewport)

        // Connect to Chrome DevTools and Set throttling property
        const client = await page.target().createCDPSession();
        await client.send("Network.emulateNetworkConditions", {
            offline: false,
            downloadThroughput: (30 * 1024 * 1024) / 8,
            uploadThroughput: (15 * 1024 * 1024) / 8,
            latency: Random.int(50, 200),
        });

        if (cookies) await page.setCookie(...JSON.parse(cookies));

        const navigator = new PuppeteerNavigator(page, browserLaunchParams);

        if (testMode) return navigator;

        return navigator;
    }

    public async navigate(url: string): Promise<void> {
        await this.page.goto(url);
        await this.waitForSomething();
    }

    private async waitForSomething(): Promise<void> {
        await Promise.race([
            this.page.waitForNetworkIdle({ timeout: 3000 }).catch(() => { }),
            this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 3000 }).catch(() => { }),
        ]);
    }

    private async centerWindowOn(selector: string): Promise<void> {
        await this.page.evaluate(
            (selector, randomX, randomY) => {
                const rect = document.querySelector(selector)?.getBoundingClientRect();
                if (rect) {
                    window.scrollTo(rect.x + window.scrollX - window.innerWidth / 2 + randomX, rect.y + window.scrollY - window.innerHeight / 2 + randomY);
                }
            },
            selector,
            Random.int(-50, 50),
            Random.int(-50, 50)
        );
    }

    public async click(selector: string, options?: ClickOptions): Promise<void> {
        await this.centerWindowOn(selector);

        if (options?.clickType === "scripted") {
            await this.page.evaluate((selector: string) => {
                // @ts-ignore
                document.querySelector(selector)?.click();
            }, selector);
            await this.waitForSomething();
            return;
        }

        if (options?.clickType === "builtin") {
            await this.page.click(selector, { delay: 0 });
            await this.waitForSomething();
            return;
        }

        if (options?.resetMousePosition) {
            const width = await this.page.evaluate(() => window.innerWidth);
            const height = await this.page.evaluate(() => window.innerHeight);
            await this.cursor.moveTo({
                x: Random.int(100, Math.min(width, 1920) - 100),
                y: Random.int(500, Math.min(height, 1080) - 100),
            });
        }

        await this.ghostCursorClick(selector);
    }

    private async ghostCursorClick(selector: string): Promise<void> {
        await this._waitFor(selector);
        // @ts-ignore
        const elem: ElementHandle<any> = await this.page.$(selector);
        // @ts-ignore
        if (!elem.remoteObject) {
            // @ts-ignore
            elem.remoteObject = () => ({ objectId: elem._remoteObject.objectId });
        }
        await this.cursor.click(elem, this.cursorOptions);
    }

    private async ghostCursorMove(selector: string): Promise<void> {
        await this._waitFor(selector);
        // @ts-ignore
        const elem: ElementHandle<any> = await this.page.$(selector);
        // @ts-ignore
        if (!elem.remoteObject) {
            // @ts-ignore
            elem.remoteObject = () => ({ objectId: elem._remoteObject.objectId });
        }
        await this.cursor.move(elem, this.cursorOptions);
    }

    public async clearText(selector: string): Promise<void> {
        await this._waitFor(selector);

        const inputValue = await this.page.evaluate(
            // @ts-ignore
            (selector: string) => document.querySelector(selector)?.value ?? "",
            selector
        );

        if (!inputValue) return;

        await this.ghostCursorClick(selector);

        await this.page.keyboard.press("End");
        for (let i = 0; i < inputValue.length; i++) {
            await this.page.keyboard.press("Backspace", { delay: 20 });
        }
    }

    public async pressKey(key: KeyInput): Promise<void> {
        await this.page.keyboard.press(key, { delay: 20 });
    }

    public async type(selector: string, text: string): Promise<void> {
        if (!text) return;

        await this._waitFor(selector);

        try {
            await this.clearText(selector);
            for (const c of text) {
                await this.page.type(selector, c, { delay: Random.int(10, 50) });
            }
        } catch (error: any) {
            error.message = `Failed to type '${text}' into '${selector}': ${error.message}`;
            throw error;
        }
    }

    public async select(selector: string, value: string): Promise<void> {
        await this._waitFor(selector);

        try {
            await this.ghostCursorMove(selector);

            await this.page.focus(selector);

            await this.page.select(selector, value);
        } catch (error: any) {
            error.message = `Waiting for selector '${selector}' failed: ${error.message}`;
            throw error;
        }
    }

    public async waitFor(selector: string, options?: WaitForOptions): Promise<void> {
        await this._waitFor(selector, options);
    }

    private async _waitFor(selector: string, options?: WaitForOptions): Promise<void> {
        // console.log(`Waiting for selector '${selector}'`);
        try {
            await this.page.waitForSelector(selector, {
                visible: true,
                timeout: options?.timeout ?? 10000,
            });
            await this.delay(100);
        } catch (error: any) {
            // await this.page.screenshot({
            //   path: `./troubleshoot-wfs-${new Date().getTime()}.png`,
            // });

            error.message = `Waiting for selector '${selector}' failed: ${error.message}`;
            throw error;
        }
    }

    public async evaluate(fn: Function, ...args: any): Promise<any> {
        try {
            // @ts-ignore
            return await this.page.evaluate(fn, ...args);
        } catch (error: any) {
            error.message = `Evaluation failed: ${error.message}`;
            throw error;
        }
    }

    public async delay(ms: number, random?: number, options?: DelayOptions): Promise<void> {
        if (ms < 0) return;
        const delay = ms + (random ? Math.random() * random : 0);
        const interval = options?.precision;
        if (interval) return intervaledDelay(delay, interval);
        return new Promise((resolve) => {
            setTimeout(resolve, delay);
        });
    }

    public async hasSelector(selector: string): Promise<boolean> {
        if (await this.page.$(selector)) {
            try {
                await this.page.waitForSelector(selector, {
                    visible: true,
                    timeout: 100,
                });
                return true;
            } catch (error) {
                return false;
            }
        }
        return false;
    }

    public async close(): Promise<void> {
        const browser = this.page.browser();
        await this.page.close();

        if ((await browser.pages()).length === 0) {
            await browser.close();
        }

        if (PuppeteerNavigator.focusedInstance === this) {
            PuppeteerNavigator.focusedInstance = null;
        }
    }

    private async randomMouseMovement(delay: number): Promise<void> {
        const startDate = Date.now();
        while (Date.now() - startDate < delay) {
            const width = await this.page.evaluate(() => window.innerWidth);
            const height = await this.page.evaluate(() => window.innerHeight);

            await this.cursor.moveTo({
                x: Random.int(100, Math.min(width, 1920) - 100),
                y: Random.int(500, Math.min(height, 1080) - 100),
            });

            await this.delay(1000, 500);
        }
    }

    public async solveCaptcha(): Promise<void> {
        await Promise.all([
            this.randomMouseMovement(40000),
        ]);

        // If captcha still present after 40s, check extension
        if (await this.hasSelector(".g-recaptcha, .captcha")) {
            Log.warn("Captcha still present after 40s");
        }

        Log.debug("Captcha solved.");
    }

    public async onDialog(fn: (dialog: { accept: Function }) => Promise<void>): Promise<void> {
        await this.page.on("dialog", fn);
    }

    public async getCurrentUrl() {
        return this.page.url();
    }

    public async openBrowser(url: string): Promise<void> {
        throw new Error("Method not implemented.");
        // const browser = await puppeteer.launch({
        //   ...this.browserLaunchParams,
        //   defaultViewport: null,
        //   slowMo: 0,
        //   headless: false,
        //   userDataDir: `${this.browserLaunchParams?.userDataDir}-tmp`,
        // });

        // // Never use this page. It's only for opening the browser and may have plugins issues.
        // const dangerPage = (await browser.pages())[0];

        // const page = await browser.newPage();

        // await page.setCookie(...(await this.page.cookies()));
        // await page.goto(url);
        // dangerPage.close();
    }

    public async getCookies(): Promise<any> {
        return this.page.cookies();
    }

    public async createTemporaryNavigator(actionFocus: boolean = true): Promise<WebNavigator> {
        const _fn = async () => {
            const browser = await this.page.browser();
            const page = await browser.newPage();
            return new PuppeteerNavigator(page, this.browserLaunchParams);
        };

        if (actionFocus) {
            return this.actionFocus(_fn, { priority: Date.now() + 30 * 1000 });
        }
        return await _fn();
    }

    private static id = 0;
    private static actions: Action[] = [];
    private static focusedAction: (Action & { promise?: Promise<any> }) | null = null;
    private static focusedInstance: WebNavigator | null = null;

    public async onBrowserClose(fn: Function): Promise<void> {
        const browser = this.page.browser();
        browser.on("disconnected", () => fn());
    }

    private static async runBeforeAction(fn: (instance: WebNavigator, action: string, ...args: any[]) => Promise<any>) {
        const actions = ["type", "click", "evaluate", "select", "navigate", "clearText", "waitFor", "solveCaptcha"];
        for (const action of actions) {
            // @ts-ignore
            const _originalAction = PuppeteerNavigator.prototype[action];
            // @ts-ignore
            PuppeteerNavigator.prototype[action] = async function (...args: any[]) {
                await fn(this, action, ...args);
                return await _originalAction.apply(this, args);
            };
        }
    }

}

// LOG
// @ts-ignore
PuppeteerNavigator.runBeforeAction((instance, action, args) => {
    Log.trace(`[${action}]: (${JSON.stringify(args)})`);
});
