package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	host             = "127.0.0.1"
	defaultUIPort    = 8765
	defaultProxyPort = 11451
	wechatUA         = "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x6307001e)"
)

type AppState struct {
	mu         sync.Mutex
	Running    bool     `json:"running"`
	Done       bool     `json:"done"`
	Error      string   `json:"error"`
	Step       int      `json:"step"`
	StepText   string   `json:"step_text"`
	Logs       []string `json:"logs"`
	ProxyAddr  string   `json:"proxy_addr"`
	OAuthURL   string   `json:"oauth_url"`
	Player     *Player  `json:"player,omitempty"`
	Scores     []Score  `json:"scores,omitempty"`
	crawling   bool
	proxy      *http.Server
	proxyLn    net.Listener
	uiPort     int
	httpClient *http.Client
}

type Player struct {
	Name       string `json:"name"`
	FriendCode string `json:"friend_code"`
	Rating     int    `json:"rating"`
	Star       int    `json:"star"`
	Trophy     string `json:"trophy"`
}

type Score struct {
	ID           int     `json:"id"`
	Title        string  `json:"title"`
	Artist       string  `json:"artist"`
	Type         string  `json:"type"`
	Level        string  `json:"level"`
	LevelIndex   int     `json:"level_index"`
	LevelName    string  `json:"level_name"`
	LevelValue   float64 `json:"level_value"`
	Achievements float64 `json:"achievements"`
	DXScore      int     `json:"dx_score"`
	MaxDXScore   int     `json:"max_dx_score"`
	DXRating     int     `json:"dx_rating"`
	FC           string  `json:"fc"`
	FS           string  `json:"fs"`
	Rate         string  `json:"rate"`
}

type oauthParams struct {
	R     string
	T     string
	Code  string
	State string
}

type SongDifficulty struct {
	ID         int
	Title      string
	Artist     string
	Type       string
	LevelIndex int
	Level      string
	LevelValue float64
}

type lxnsResponse struct {
	Songs []struct {
		ID           int    `json:"id"`
		Title        string `json:"title"`
		Artist       string `json:"artist"`
		Difficulties struct {
			Standard []lxnsDifficulty `json:"standard"`
			DX       []lxnsDifficulty `json:"dx"`
			Utage    []lxnsDifficulty `json:"utage"`
		} `json:"difficulties"`
	} `json:"songs"`
}

type lxnsDifficulty struct {
	Difficulty int     `json:"difficulty"`
	Level      string  `json:"level"`
	LevelValue float64 `json:"level_value"`
}

var (
	state = &AppState{
		StepText:   "未开始",
		httpClient: directHTTPClient(30 * time.Second),
	}
	songsMu    sync.Mutex
	songsByKey map[string]SongDifficulty
)

func main() {
	port := flag.Int("port", defaultUIPort, "Web UI port")
	noBrowser := flag.Bool("no-browser", false, "do not open browser automatically")
	selfTest := flag.Bool("self-test", false, "run endpoint self-test and exit")
	flag.Parse()

	if *selfTest {
		if err := runSelfTest(); err != nil {
			log.Fatal(err)
		}
		fmt.Println("self-test ok")
		return
	}

	if err := runUI(*port, !*noBrowser); err != nil {
		log.Fatal(err)
	}
}

func runUI(port int, openBrowser bool) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", handleIndex)
	mux.HandleFunc("/api/start", handleStart)
	mux.HandleFunc("/api/status", handleStatus)
	mux.HandleFunc("/api/scores", handleScores)
	mux.HandleFunc("/api/reset", handleReset)

	ln, err := listenPreferred(port)
	if err != nil {
		return err
	}
	actualPort := ln.Addr().(*net.TCPAddr).Port
	state.mu.Lock()
	state.uiPort = actualPort
	state.mu.Unlock()

	url := fmt.Sprintf("http://%s:%d/", host, actualPort)
	fmt.Println("rRanker WeChat demo:", url)
	fmt.Println("Press Ctrl+C to stop.")
	if openBrowser {
		go func() {
			time.Sleep(250 * time.Millisecond)
			_ = openURL(url)
		}()
	}
	return http.Serve(ln, mux)
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	write(w, http.StatusOK, "text/html; charset=utf-8", []byte(indexHTML))
}

func handleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	if err := startFlow(); err != nil {
		setError(err.Error())
		writeJSON(w, http.StatusBadGateway, publicState())
		return
	}
	writeJSON(w, http.StatusOK, publicState())
}

func handleStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, publicState())
}

func handleScores(w http.ResponseWriter, _ *http.Request) {
	state.mu.Lock()
	body := map[string]any{"player": state.Player, "scores": state.Scores}
	state.mu.Unlock()
	writeJSON(w, http.StatusOK, body)
}

func handleReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	resetState(false)
	writeJSON(w, http.StatusOK, publicState())
}

func startFlow() error {
	proxyAddr, err := ensureProxy()
	if err != nil {
		return err
	}
	oauthURL, err := generateOAuthURL()
	if err != nil {
		return err
	}
	state.mu.Lock()
	state.Running = true
	state.Done = false
	state.Error = ""
	state.Step = 1
	state.StepText = "代理已启动，等待微信 OAuth 回调"
	state.Logs = nil
	state.ProxyAddr = proxyAddr
	state.OAuthURL = oauthURL
	state.Player = nil
	state.Scores = nil
	state.crawling = false
	state.mu.Unlock()
	addLog("代理地址：" + proxyAddr)
	addLog("OAuth 链接已生成，请复制到 PC 微信打开")
	return nil
}

func publicState() map[string]any {
	state.mu.Lock()
	defer state.mu.Unlock()
	logs := append([]string(nil), state.Logs...)
	return map[string]any{
		"running":     state.Running,
		"done":        state.Done,
		"error":       state.Error,
		"step":        state.Step,
		"step_text":   state.StepText,
		"logs":        logs,
		"proxy_addr":  state.ProxyAddr,
		"oauth_url":   state.OAuthURL,
		"score_count": len(state.Scores),
	}
}

func resetState(stopProxy bool) {
	if stopProxy {
		state.mu.Lock()
		srv, ln := state.proxy, state.proxyLn
		state.proxy, state.proxyLn = nil, nil
		state.mu.Unlock()
		if srv != nil {
			_ = srv.Shutdown(context.Background())
		}
		if ln != nil {
			_ = ln.Close()
		}
	}
	state.mu.Lock()
	state.Running = false
	state.Done = false
	state.Error = ""
	state.Step = 0
	state.StepText = "未开始"
	state.Logs = nil
	state.OAuthURL = ""
	state.Player = nil
	state.Scores = nil
	state.crawling = false
	state.mu.Unlock()
}

func setStep(step int, text string) {
	state.mu.Lock()
	state.Step = step
	state.StepText = text
	state.mu.Unlock()
	addLog(text)
}

func setError(text string) {
	state.mu.Lock()
	state.Running = false
	state.Done = false
	state.Error = text
	state.StepText = "失败：" + text
	state.mu.Unlock()
	addLog("失败：" + text)
}

func addLog(text string) {
	state.mu.Lock()
	defer state.mu.Unlock()
	line := time.Now().Format("15:04:05") + " " + text
	state.Logs = append(state.Logs, line)
	if len(state.Logs) > 120 {
		state.Logs = state.Logs[len(state.Logs)-120:]
	}
}

func ensureProxy() (string, error) {
	state.mu.Lock()
	if state.proxy != nil && state.proxyLn != nil {
		addr := state.proxyLn.Addr().String()
		state.mu.Unlock()
		return addr, nil
	}
	state.mu.Unlock()

	ln, err := listenPreferred(defaultProxyPort)
	if err != nil {
		return "", err
	}
	srv := &http.Server{Handler: http.HandlerFunc(proxyHandler)}
	state.mu.Lock()
	state.proxy = srv
	state.proxyLn = ln
	state.mu.Unlock()
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			addLog("代理退出：" + err.Error())
		}
	}()
	return ln.Addr().String(), nil
}

func proxyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		handleConnect(w, r)
		return
	}
	if maybeCaptureOAuth(w, r) {
		return
	}
	forwardHTTP(w, r)
}

func maybeCaptureOAuth(w http.ResponseWriter, r *http.Request) bool {
	target := r.URL.String()
	if !r.URL.IsAbs() {
		target = "http://" + r.Host + r.URL.RequestURI()
	}
	u, err := url.Parse(target)
	if err != nil {
		return false
	}
	if !strings.Contains(u.Host, "wahlap") || !strings.Contains(u.Path, "/wc_auth/oauth/callback/maimai-dx") {
		return false
	}
	q := u.Query()
	params := oauthParams{R: q.Get("r"), T: q.Get("t"), Code: q.Get("code"), State: q.Get("state")}
	if params.R == "" || params.T == "" || params.Code == "" || params.State == "" {
		write(w, http.StatusBadRequest, "text/plain; charset=utf-8", []byte("missing oauth parameters"))
		return true
	}
	addLog("已截获 OAuth 回调")
	write(w, http.StatusOK, "text/html; charset=utf-8", []byte("<meta charset='utf-8'><h2>rRanker 已截获 OAuth 回调</h2><p>请回到 demo 页面等待成绩抓取完成。</p>"))

	state.mu.Lock()
	if state.crawling {
		state.mu.Unlock()
		return true
	}
	state.crawling = true
	state.mu.Unlock()
	go crawlWithOAuth(params)
	return true
}

func handleConnect(w http.ResponseWriter, r *http.Request) {
	dst, err := net.DialTimeout("tcp", r.Host, 15*time.Second)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		_ = dst.Close()
		http.Error(w, "hijacking not supported", http.StatusInternalServerError)
		return
	}
	conn, _, err := hj.Hijack()
	if err != nil {
		_ = dst.Close()
		return
	}
	_, _ = conn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	go tunnel(dst, conn)
	go tunnel(conn, dst)
}

func tunnel(dst io.WriteCloser, src io.ReadCloser) {
	defer dst.Close()
	defer src.Close()
	_, _ = io.Copy(dst, src)
}

func forwardHTTP(w http.ResponseWriter, r *http.Request) {
	target := r.URL
	if !target.IsAbs() {
		u, err := url.Parse("http://" + r.Host + r.URL.RequestURI())
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		target = u
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Header = r.Header.Clone()
	removeHopHeaders(req.Header)
	req.RequestURI = ""
	resp, err := state.httpClient.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	removeHopHeaders(resp.Header)
	for k, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func removeHopHeaders(h http.Header) {
	for _, key := range []string{"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade"} {
		h.Del(key)
	}
}

func generateOAuthURL() (string, error) {
	client := directHTTPClient(20 * time.Second)
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	req, err := http.NewRequest(http.MethodGet, "https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx", nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	location := resp.Header.Get("Location")
	if location == "" {
		return "", fmt.Errorf("authorize did not return Location, status=%d", resp.StatusCode)
	}
	location = strings.ReplaceAll(location, "redirect_uri=https", "redirect_uri=http")
	location = strings.ReplaceAll(location, "redirect_uri=https%3A", "redirect_uri=http%3A")
	return location, nil
}

func crawlWithOAuth(params oauthParams) {
	setStep(2, "OAuth 已截获，正在换取微信会话")
	jar, _ := cookiejar.New(nil)
	client := directHTTPClient(40 * time.Second)
	client.Jar = jar
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	if err := exchangeOAuth(client, params); err != nil {
		setError(err.Error())
		return
	}
	setStep(3, "会话已取得，正在加载曲库")
	songs, err := loadSongs()
	if err != nil {
		addLog("曲库加载失败，将仅展示网页原始字段：" + err.Error())
	} else {
		addLog(fmt.Sprintf("曲库加载完成：%d 个谱面索引", len(songs)))
	}

	setStep(4, "正在读取玩家信息")
	player, err := fetchPlayer(client)
	if err != nil {
		setError(err.Error())
		return
	}

	setStep(5, "正在并行抓取 5 个难度成绩")
	scores, err := fetchAllScores(client)
	if err != nil {
		setError(err.Error())
		return
	}
	for i := range scores {
		enrichScore(&scores[i], songs)
	}
	sort.Slice(scores, func(i, j int) bool {
		if scores[i].DXRating == scores[j].DXRating {
			return scores[i].Title < scores[j].Title
		}
		return scores[i].DXRating > scores[j].DXRating
	})

	state.mu.Lock()
	state.Player = &player
	state.Scores = scores
	state.Running = false
	state.Done = true
	state.Step = 6
	state.StepText = fmt.Sprintf("完成：%d 条成绩", len(scores))
	state.mu.Unlock()
	addLog(fmt.Sprintf("完成：玩家=%s Rating=%d 成绩=%d", player.Name, player.Rating, len(scores)))
}

func exchangeOAuth(client *http.Client, params oauthParams) error {
	u, _ := url.Parse("https://tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx")
	q := u.Query()
	q.Set("r", params.R)
	q.Set("t", params.T)
	q.Set("code", params.Code)
	q.Set("state", params.State)
	u.RawQuery = q.Encode()

	req, _ := http.NewRequest(http.MethodGet, u.String(), nil)
	req.Header.Set("User-Agent", wechatUA)
	req.Header.Set("Host", "tgk-wcaime.wahlap.com")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusMovedPermanently && resp.StatusCode != http.StatusSeeOther {
		return fmt.Errorf("OAuth token invalid or expired, status=%d", resp.StatusCode)
	}
	location := resp.Header.Get("Location")
	if location == "" {
		return errors.New("OAuth callback did not return redirect Location")
	}
	nextURL, err := resp.Request.URL.Parse(location)
	if err != nil {
		return err
	}
	req2, _ := http.NewRequest(http.MethodGet, nextURL.String(), nil)
	req2.Header.Set("User-Agent", wechatUA)
	resp2, err := client.Do(req2)
	if err != nil {
		return err
	}
	defer resp2.Body.Close()
	if resp2.StatusCode >= 400 {
		return fmt.Errorf("wechat session redirect failed, status=%d", resp2.StatusCode)
	}
	return nil
}

func fetchPlayer(client *http.Client) (Player, error) {
	req, _ := http.NewRequest(http.MethodGet, "https://maimai.wahlap.com/maimai-mobile/friend/userFriendCode/", nil)
	req.Header.Set("User-Agent", wechatUA)
	resp, err := client.Do(req)
	if err != nil {
		return Player{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusFound || resp.StatusCode == http.StatusMovedPermanently {
		return Player{}, errors.New("微信会话已失效或未登录，玩家信息被重定向")
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Player{}, err
	}
	return parsePlayer(string(body)), nil
}

func fetchAllScores(client *http.Client) ([]Score, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var firstErr error
	var out []Score
	for diff := 0; diff <= 4; diff++ {
		diff := diff
		wg.Add(1)
		go func() {
			defer wg.Done()
			scores, err := fetchScoreDiff(client, diff)
			mu.Lock()
			defer mu.Unlock()
			if err != nil && firstErr == nil {
				firstErr = err
				return
			}
			out = append(out, scores...)
			addLog(fmt.Sprintf("diff=%d 完成：%d 条", diff, len(scores)))
		}()
	}
	wg.Wait()
	return out, firstErr
}

func fetchScoreDiff(client *http.Client, diff int) ([]Score, error) {
	u := fmt.Sprintf("https://maimai.wahlap.com/maimai-mobile/record/musicGenre/search/?genre=99&diff=%d", diff)
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	req.Header.Set("User-Agent", wechatUA)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusFound || resp.StatusCode == http.StatusMovedPermanently {
		return nil, errors.New("微信会话已失效或维护中，成绩页被重定向")
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return parseScores(string(body)), nil
}

func loadSongs() (map[string]SongDifficulty, error) {
	songsMu.Lock()
	if songsByKey != nil {
		defer songsMu.Unlock()
		return songsByKey, nil
	}
	songsMu.Unlock()

	client := directHTTPClient(30 * time.Second)
	resp, err := client.Get("https://maimai.lxns.net/api/v0/maimai/song/list?notes=true")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LXNS song/list status=%d", resp.StatusCode)
	}
	var payload lxnsResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	index := make(map[string]SongDifficulty)
	for _, song := range payload.Songs {
		for _, diff := range song.Difficulties.Standard {
			d := SongDifficulty{ID: song.ID % 10000, Title: song.Title, Artist: song.Artist, Type: "SD", LevelIndex: diff.Difficulty, Level: diff.Level, LevelValue: diff.LevelValue}
			index[songKey(song.Title, "SD", diff.Difficulty)] = d
			index[songKey(song.Title, "", diff.Difficulty)] = d
		}
		for _, diff := range song.Difficulties.DX {
			d := SongDifficulty{ID: song.ID % 10000, Title: song.Title, Artist: song.Artist, Type: "DX", LevelIndex: diff.Difficulty, Level: diff.Level, LevelValue: diff.LevelValue}
			index[songKey(song.Title, "DX", diff.Difficulty)] = d
			if _, ok := index[songKey(song.Title, "", diff.Difficulty)]; !ok {
				index[songKey(song.Title, "", diff.Difficulty)] = d
			}
		}
		for _, diff := range song.Difficulties.Utage {
			d := SongDifficulty{ID: song.ID, Title: song.Title, Artist: song.Artist, Type: "UTAGE", LevelIndex: diff.Difficulty, Level: diff.Level, LevelValue: diff.LevelValue}
			index[songKey(song.Title, "UTAGE", diff.Difficulty)] = d
		}
	}
	songsMu.Lock()
	songsByKey = index
	songsMu.Unlock()
	return index, nil
}

func enrichScore(score *Score, songs map[string]SongDifficulty) {
	if score.Rate == "" {
		score.Rate = rateFor(score.Achievements)
	}
	score.LevelName = levelName(score.LevelIndex)
	if songs != nil {
		if d, ok := songs[songKey(score.Title, score.Type, score.LevelIndex)]; ok {
			score.ID = d.ID
			score.Artist = d.Artist
			score.LevelValue = d.LevelValue
			score.Level = d.Level
		} else if d, ok := songs[songKey(score.Title, "", score.LevelIndex)]; ok {
			score.ID = d.ID
			score.Artist = d.Artist
			score.LevelValue = d.LevelValue
			score.Level = d.Level
		}
	}
	if score.LevelValue == 0 {
		score.LevelValue = parseLevelValue(score.Level)
	}
	if score.DXRating == 0 && score.LevelValue > 0 {
		score.DXRating = int(coefficient(score.Achievements) * score.LevelValue * math.Min(100.5, score.Achievements) / 100)
	}
}

func songKey(title, typ string, diff int) string {
	return strings.TrimSpace(title) + "|" + typ + "|" + strconv.Itoa(diff)
}

func directHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy: nil,
			DialContext: (&net.Dialer{
				Timeout:   15 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout: 15 * time.Second,
		},
	}
}

func listenPreferred(port int) (net.Listener, error) {
	ln, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, port))
	if err == nil {
		return ln, nil
	}
	return net.Listen("tcp", host+":0")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	body, _ := json.Marshal(payload)
	write(w, status, "application/json; charset=utf-8", body)
}

func write(w http.ResponseWriter, status int, contentType string, body []byte) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func openURL(target string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", target).Start()
}

func runSelfTest() error {
	ln, err := listenPreferred(0)
	if err != nil {
		return err
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port
	state.mu.Lock()
	state.uiPort = port
	state.mu.Unlock()

	mux := http.NewServeMux()
	mux.HandleFunc("/", handleIndex)
	mux.HandleFunc("/api/start", handleStart)
	mux.HandleFunc("/api/status", handleStatus)
	mux.HandleFunc("/api/scores", handleScores)
	srv := &http.Server{Handler: mux}
	go func() { _ = srv.Serve(ln) }()
	defer srv.Shutdown(context.Background())
	defer resetState(true)

	base := fmt.Sprintf("http://%s:%d", host, port)
	resp, err := http.Get(base + "/")
	if err != nil {
		return err
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if !bytes.Contains(body, []byte("rRanker 微信真实成绩 Demo")) {
		return errors.New("index html mismatch")
	}
	req, _ := http.NewRequest(http.MethodPost, base+"/api/start", strings.NewReader("{}"))
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("start failed: %s", data)
	}
	var st map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		return err
	}
	if st["proxy_addr"] == "" || st["oauth_url"] == "" {
		return errors.New("start did not return proxy/oauth")
	}
	if _, err := loadSongs(); err != nil {
		return fmt.Errorf("LXNS public API failed: %w", err)
	}
	return nil
}

var (
	formRe        = regexp.MustCompile(`(?is)<form\b[^>]*>.*?</form>`)
	imgSrcRe      = regexp.MustCompile(`(?is)<img\b[^>]*src=["']([^"']+)["']`)
	tagRe         = regexp.MustCompile(`(?is)<[^>]+>`)
	spaceRe       = regexp.MustCompile(`\s+`)
	digitRe       = regexp.MustCompile(`\d+`)
	iconNameRe    = regexp.MustCompile(`((?:[dcbas]{1,3}|fc|ap|sync|fs|fdx)p?)(?:lus)?\.png`)
	divClassCache sync.Map
)

func parseScores(src string) []Score {
	forms := formRe.FindAllString(src, -1)
	var scores []Score
	for _, form := range forms {
		if !strings.Contains(form, "music_name_block") {
			continue
		}
		score := Score{
			Title:      textByClass(form, "music_name_block"),
			Level:      textByClass(form, "music_lv_block"),
			LevelIndex: levelIndexFromHTML(form),
			Type:       typeFromHTML(form),
		}
		score.LevelName = levelName(score.LevelIndex)
		scoreBlocks := allTextByClass(form, "music_score_block")
		if len(scoreBlocks) > 0 {
			score.Achievements = parseFloat(strings.TrimSuffix(scoreBlocks[0], "%"))
		}
		if len(scoreBlocks) > 1 {
			score.DXScore, score.MaxDXScore = parseDXScore(scoreBlocks[1])
		}
		icons := parseIcons(form)
		if len(icons) >= 3 {
			score.FS = icons[0]
			score.FC = icons[1]
			score.Rate = icons[2]
		}
		if score.Title != "" {
			scores = append(scores, score)
		}
	}
	return scores
}

func parsePlayer(src string) Player {
	player := Player{
		Name:       textByClass(src, "name_block"),
		FriendCode: digits(textByClass(src, "see_through_block")),
		Rating:     parseInt(digits(textByClass(src, "rating_block"))),
		Trophy:     textByClass(src, "trophy_inner_block"),
		Star:       parseInt(digits(textByClass(src, "p_l_10"))),
	}
	return player
}

func textByClass(src, class string) string {
	values := allTextByClass(src, class)
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func allTextByClass(src, class string) []string {
	reAny, ok := divClassCache.Load(class)
	var re *regexp.Regexp
	if ok {
		re = reAny.(*regexp.Regexp)
	} else {
		re = regexp.MustCompile(`(?is)<div\b[^>]*class=["'][^"']*` + regexp.QuoteMeta(class) + `[^"']*["'][^>]*>(.*?)</div>`)
		divClassCache.Store(class, re)
	}
	matches := re.FindAllStringSubmatch(src, -1)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		text := cleanText(m[1])
		if text != "" && text != "\u3000" {
			out = append(out, text)
		}
	}
	return out
}

func cleanText(src string) string {
	src = tagRe.ReplaceAllString(src, "")
	src = html.UnescapeString(src)
	src = strings.ReplaceAll(src, "\u00a0", " ")
	src = spaceRe.ReplaceAllString(src, " ")
	return strings.TrimSpace(src)
}

func levelIndexFromHTML(src string) int {
	lower := strings.ToLower(src)
	switch {
	case strings.Contains(lower, "remaster"):
		return 4
	case strings.Contains(lower, "master"):
		return 3
	case strings.Contains(lower, "expert"):
		return 2
	case strings.Contains(lower, "advanced"):
		return 1
	case strings.Contains(lower, "basic"):
		return 0
	default:
		return -1
	}
}

func typeFromHTML(src string) string {
	lower := strings.ToLower(src)
	switch {
	case strings.Contains(lower, "music_standard") || strings.Contains(lower, "_standard.png"):
		return "SD"
	case strings.Contains(lower, "music_dx") || strings.Contains(lower, "_dx.png"):
		return "DX"
	default:
		return "DX"
	}
}

func parseIcons(src string) []string {
	matches := imgSrcRe.FindAllStringSubmatch(src, -1)
	var icons []string
	for _, m := range matches {
		if !strings.Contains(m[1], "music_icon") {
			continue
		}
		if found := iconNameRe.FindStringSubmatch(strings.ToLower(m[1])); len(found) > 1 {
			icons = append(icons, found[1])
		}
	}
	return icons
}

func parseDXScore(text string) (int, int) {
	text = strings.ReplaceAll(text, " ", "")
	text = strings.ReplaceAll(text, ",", "")
	parts := strings.Split(text, "/")
	if len(parts) != 2 {
		return 0, 0
	}
	return parseInt(digits(parts[0])), parseInt(digits(parts[1]))
}

func parseLevelValue(level string) float64 {
	level = strings.TrimSpace(strings.ReplaceAll(level, "+", ".7"))
	return parseFloat(level)
}

func digits(s string) string {
	return strings.Join(digitRe.FindAllString(s, -1), "")
}

func parseInt(s string) int {
	if s == "" {
		return 0
	}
	n, _ := strconv.Atoi(s)
	return n
}

func parseFloat(s string) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", ""))
	f, _ := strconv.ParseFloat(s, 64)
	return f
}

func levelName(index int) string {
	switch index {
	case 0:
		return "BASIC"
	case 1:
		return "ADVANCED"
	case 2:
		return "EXPERT"
	case 3:
		return "MASTER"
	case 4:
		return "Re:MASTER"
	default:
		return "-"
	}
}

func coefficient(achievement float64) float64 {
	table := []struct {
		min float64
		c   float64
	}{
		{0, 0}, {10, 1.6}, {20, 3.2}, {30, 4.8}, {40, 6.4}, {50, 8.0},
		{60, 9.6}, {70, 11.2}, {75, 12.0}, {79.9999, 12.8}, {80, 13.6},
		{90, 15.2}, {94, 16.8}, {96.9999, 17.6}, {97, 20.0}, {98, 20.3},
		{98.9999, 20.6}, {99, 20.8}, {99.5, 21.1}, {99.9999, 21.4},
		{100, 21.6}, {100.4999, 22.2}, {100.5, 22.4},
	}
	c := 0.0
	for i := range table {
		if achievement >= table[i].min {
			c = table[i].c
		}
	}
	return c
}

func rateFor(achievement float64) string {
	switch {
	case achievement >= 100.5:
		return "sssp"
	case achievement >= 100:
		return "sss"
	case achievement >= 99.5:
		return "ssp"
	case achievement >= 99:
		return "ss"
	case achievement >= 98:
		return "sp"
	case achievement >= 97:
		return "s"
	default:
		return "aaa"
	}
}

const indexHTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rRanker 微信真实成绩 Demo</title>
<style>
:root{--bg:#f5f7fb;--panel:#fff;--text:#1f2430;--muted:#667085;--line:#d8dee8;--brand:#1967d2;--ok:#147a43;--warn:#b25e09;--err:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif}header{background:#fff;border-bottom:1px solid var(--line);padding:20px 28px}h1{margin:0 0 6px;font-size:22px}.sub{margin:0;color:var(--muted);font-size:14px;line-height:1.5}main{width:min(1180px,calc(100vw - 32px));margin:18px auto 40px;display:grid;grid-template-columns:380px 1fr;gap:16px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px}.control{padding:16px;align-self:start;position:sticky;top:12px}button{border:1px solid transparent;border-radius:6px;min-height:38px;padding:9px 13px;font-size:14px;font-weight:700;cursor:pointer}.primary{background:var(--brand);color:#fff}.secondary{background:#f4f6fa;border-color:var(--line);color:var(--text)}button:disabled{opacity:.55;cursor:not-allowed}.row{display:flex;gap:8px;margin-bottom:12px}.status{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:14px}.dot{width:9px;height:9px;border-radius:50%;background:var(--muted)}.dot.run{background:var(--warn)}.dot.done{background:var(--ok)}.dot.err{background:var(--err)}label{display:block;margin:12px 0 4px;color:var(--muted);font-size:12px}.copy{display:flex;gap:8px}.copy input{min-width:0;flex:1;border:1px solid var(--line);border-radius:6px;padding:8px;background:#fbfcff;font-size:12px}ol{padding-left:20px;color:var(--muted);font-size:13px;line-height:1.65}.logs{margin-top:12px;height:150px;overflow:auto;border-radius:6px;background:#101828;color:#d0d5dd;padding:10px;font:12px/1.45 Consolas,monospace;white-space:pre-wrap}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}.metric{border:1px solid var(--line);border-radius:7px;background:#fbfcff;padding:10px}.metric b{display:block;font-size:18px}.metric span{color:var(--muted);font-size:12px}.toolbar{display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}.toolbar input,.toolbar select{border:1px solid var(--line);border-radius:6px;min-height:36px;padding:7px 9px;background:#fff}.toolbar input{flex:1;min-width:0}.list{display:grid;gap:10px;padding:14px 16px 18px}.empty{text-align:center;color:var(--muted);padding:58px 16px}.card{display:grid;grid-template-columns:minmax(0,1fr) 128px;gap:12px;padding:11px;border:1px solid var(--line);border-radius:8px;background:#fff}.title{font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.artist{margin-top:4px;color:var(--muted);font-size:12px}.badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.badge{border-radius:999px;padding:3px 7px;background:#eef2f7;color:#344054;font-size:11px;font-weight:750}.basic{background:#36a365;color:#fff}.advanced{background:#d7951f;color:#fff}.expert{background:#d64a66;color:#fff}.master{background:#8a59c2;color:#fff}.remaster{background:#bd6aa8;color:#fff}.num{text-align:right}.ach{font-size:20px;font-weight:820}.ra{margin-top:3px;color:var(--muted);font-size:12px;line-height:1.45}@media(max-width:900px){main{grid-template-columns:1fr}.control{position:static}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.card{grid-template-columns:1fr}.num{text-align:left}.toolbar{flex-wrap:wrap}.toolbar input{flex-basis:100%}}
</style>
</head>
<body>
<header><h1>rRanker 微信真实成绩 Demo</h1><p class="sub">单 EXE 启动：本地 Web UI + HTTP/CONNECT 代理 + 华立微信 OAuth + 成绩抓取。不会安装 Python 或第三方依赖。</p></header>
<main>
<section class="panel control">
<div class="row"><button id="start" class="primary">开始</button><button id="reset" class="secondary">重置</button></div>
<div class="status"><span id="dot" class="dot"></span><span id="status">未开始</span></div>
<label>代理地址</label><div class="copy"><input id="proxy" readonly placeholder="点击开始后生成"><button class="secondary" data-copy="proxy">复制</button></div>
<label>OAuth 链接</label><div class="copy"><input id="oauth" readonly placeholder="点击开始后生成"><button class="secondary" data-copy="oauth">复制</button></div>
<ol>
<li>点击开始，复制代理地址。</li>
<li>让 PC 微信使用该代理；如果微信没有单独代理入口，可临时填到系统代理，抓完马上关。</li>
<li>复制 OAuth 链接到 PC 微信打开。</li>
<li>页面显示“已截获 OAuth 回调”后，回到这里等待成绩列表。</li>
</ol>
<div id="logs" class="logs">等待开始...</div>
</section>
<section class="panel">
<div id="summary" class="summary"></div>
<div class="toolbar"><input id="q" placeholder="搜索曲名或 artist"><select id="diff"><option value="">全部难度</option><option>BASIC</option><option>ADVANCED</option><option>EXPERT</option><option>MASTER</option><option>Re:MASTER</option></select><select id="sort"><option value="dx_rating">按 RA</option><option value="achievements">按达成率</option><option value="title">按曲名</option></select></div>
<div id="list" class="list"><div class="empty">等待抓取成绩。</div></div>
</section>
</main>
<script>
const $=id=>document.getElementById(id);let timer=null,scores=[],player=null;
const cls={"BASIC":"basic","ADVANCED":"advanced","EXPERT":"expert","MASTER":"master","Re:MASTER":"remaster"};
async function api(path,opt={}){const r=await fetch(path,{headers:{"content-type":"application/json"},...opt});const j=await r.json();if(!r.ok)throw new Error(j.error||j.step_text||r.status);return j}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setState(s){$("status").textContent=s.step_text||"未开始";$("dot").className="dot"+(s.error?" err":s.done?" done":s.running?" run":"");$("proxy").value=s.proxy_addr||"";$("oauth").value=s.oauth_url||"";$("logs").textContent=(s.logs&&s.logs.length?s.logs:["等待开始..."]).join("\n");$("logs").scrollTop=$("logs").scrollHeight}
async function start(){ $("start").disabled=true; scores=[]; player=null; renderSummary(); render(); try{setState(await api("/api/start",{method:"POST",body:"{}"})); timer=setInterval(poll,800); await poll()}catch(e){$("status").textContent="启动失败："+e.message;$("start").disabled=false}}
async function poll(){try{const s=await api("/api/status");setState(s);if(s.done){clearInterval(timer);timer=null;$("start").disabled=false;await loadScores()}if(s.error){$("start").disabled=false}}catch(e){$("status").textContent="轮询失败："+e.message}}
async function loadScores(){const d=await api("/api/scores");player=d.player;scores=d.scores||[];renderSummary();render()}
async function reset(){if(timer)clearInterval(timer);timer=null;setState(await api("/api/reset",{method:"POST",body:"{}"}));scores=[];player=null;renderSummary();render();$("start").disabled=false}
function renderSummary(){if(!player){$("summary").innerHTML='<div class="metric"><b>-</b><span>玩家</span></div><div class="metric"><b>-</b><span>Rating</span></div><div class="metric"><b>-</b><span>成绩数</span></div><div class="metric"><b>-</b><span>FC / FS</span></div>';return}const fc=scores.filter(x=>x.fc).length,fs=scores.filter(x=>x.fs).length;$("summary").innerHTML='<div class="metric"><b>'+esc(player.name)+'</b><span>玩家</span></div><div class="metric"><b>'+(player.rating||"-")+'</b><span>Rating</span></div><div class="metric"><b>'+scores.length+'</b><span>成绩数</span></div><div class="metric"><b>'+fc+' / '+fs+'</b><span>FC / FS</span></div>'}
function render(){if(!scores.length){$("list").innerHTML='<div class="empty">等待抓取成绩。</div>';return}const q=$("q").value.toLowerCase().trim(),d=$("diff").value,sort=$("sort").value;let rows=scores.filter(x=>(!q||(x.title+" "+x.artist).toLowerCase().includes(q))&&(!d||x.level_name===d));rows.sort((a,b)=>sort==="title"?String(a.title).localeCompare(String(b.title),"zh-Hans-CN"):(Number(b[sort]||0)-Number(a[sort]||0)));$("list").innerHTML=rows.map(card).join("")||'<div class="empty">没有匹配成绩。</div>'}
function card(s){const diff=s.level_name||"-";return '<article class="card"><div><div class="title" title="'+esc(s.title)+'">'+esc(s.title)+'</div><div class="artist">'+esc(s.artist||"")+'</div><div class="badges"><span class="badge '+(cls[diff]||"")+'">'+esc(diff)+' '+esc(s.level)+'</span><span class="badge">'+esc(s.type)+'</span><span class="badge">'+fmtRate(s.rate)+'</span>'+(s.fc?'<span class="badge">'+fmtIcon(s.fc)+'</span>':"")+(s.fs?'<span class="badge">'+fmtIcon(s.fs)+'</span>':"")+'</div></div><div class="num"><div class="ach">'+Number(s.achievements||0).toFixed(4)+'%</div><div class="ra">RA '+(s.dx_rating||0)+'<br>DX '+(s.dx_score||0)+' / '+(s.max_dx_score||0)+'</div></div></article>'}
function fmtRate(v){return ({sssp:"SSS+",sss:"SSS",ssp:"SS+",ss:"SS",sp:"S+",s:"S"}[v]||String(v||"-").toUpperCase())}
function fmtIcon(v){return ({fcp:"FC+",app:"AP+",fsp:"FS+",fdxp:"FDX+"}[v]||String(v||"").toUpperCase())}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-copy]");if(!b)return;const input=$(b.dataset.copy);await navigator.clipboard.writeText(input.value);const t=b.textContent;b.textContent="已复制";setTimeout(()=>b.textContent=t,900)});
$("start").onclick=start;$("reset").onclick=reset;$("q").oninput=render;$("diff").onchange=render;$("sort").onchange=render;renderSummary();poll().catch(()=>{});
</script>
</body>
</html>`

func init() {
	log.SetFlags(0)
	if strings.Contains(strings.ToLower(os.Getenv("HTTP_PROXY")+os.Getenv("HTTPS_PROXY")), "127.0.0.1") {
		// The demo uses direct clients internally, but clearing inherited proxy vars makes
		// accidental child process diagnostics less confusing.
		_ = os.Setenv("HTTP_PROXY", "")
		_ = os.Setenv("HTTPS_PROXY", "")
		_ = os.Setenv("http_proxy", "")
		_ = os.Setenv("https_proxy", "")
	}
}
