//go:build mage
// +build mage

/*
   Velociraptor - Dig Deeper
   Copyright (C) 2019-2025 Rapid7 Inc.

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU Affero General Public License as published
   by the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Affero General Public License for more details.

   You should have received a copy of the GNU Affero General Public License
   along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/Masterminds/semver/v3"
	"github.com/Velocidex/fileb0x/runner"
	"github.com/magefile/mage/mg"
	"github.com/magefile/mage/sh"
	"gopkg.in/yaml.v2"
	"www.velocidex.com/golang/velociraptor/constants"
	"www.velocidex.com/golang/velociraptor/json"
)

var (
	assets = []string{
		"artifacts/b0x.yaml",
		"config/b0x.yaml",
		"gui/velociraptor/b0x.yaml",
		"crypto/b0x.yaml",
	}

	index_template = "gui/velociraptor/build/index.html"

	// Fallback cross compilers (used when zig is not installed).

	// apt-get install gcc-mingw-w64-x86-64
	mingw_xcompiler = "x86_64-w64-mingw32-gcc"

	// apt-get install gcc-mingw-w64
	mingw_xcompiler_32 = "i686-w64-mingw32-gcc"
	musl_xcompiler     = "musl-gcc"
	name               = "velociraptor"
	version            = "v" + constants.VERSION

	// https://github.com/googleapis/google-cloud-go/issues/11448
	// google cloud suddenly increased its dependency size by about
	// 20mb without warning. This little documented tag is used to
	// remove useless bloat.
	base_tags = " server_vql extras disable_grpc_modules "
)

// getenv_or returns the value of the environment variable key, or
// def if it is unset.  Used to override fallback compiler names
// (e.g. MUSL_XCOMPILER) when zig is not available.
func getenv_or(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// zig_detected returns true if zig is available in PATH.
func zig_detected() bool {
	err := sh.Run("zig", "version")
	return err == nil
}

// resolve_cc selects the C compiler for a given target.  When zig is
// installed it returns a zig cc invocation with the right -target
// triple.  Otherwise it falls back to the named system compiler,
// which can be overridden via environment variables (MUSL_XCOMPILER,
// ARM64_XCOMPILER, ARMHF_XCOMPILER).
func resolve_cc(cc string) string {
	if zig_detected() {
		switch cc {
		case "musl-gcc":
			return "zig cc -target x86_64-linux-musl"
		case "aarch64-linux-gnu-gcc":
			return "zig cc -target aarch64-linux-gnu"
		case "arm-linux-gnueabihf-gcc":
			return "zig cc -target arm-linux-gnueabihf"
		}
	}
	switch cc {
	case "musl-gcc":
		return getenv_or("MUSL_XCOMPILER", cc)
	case "aarch64-linux-gnu-gcc":
		return getenv_or("ARM64_XCOMPILER", cc)
	case "arm-linux-gnueabihf-gcc":
		return getenv_or("ARMHF_XCOMPILER", cc)
	}
	return cc
}

func ReadAllWithLimit(
	fd io.Reader, limit int) ([]byte, error) {
	return ioutil.ReadAll(io.LimitReader(fd, int64(limit)))
}

type Builder struct {
	goos          string
	arch          string
	extension     string
	extra_tags    string
	extra_flags   []string
	extra_ldflags string
	cc            string

	disable_cgo bool
	sumo        bool

	debug_build bool

	// Set to override the output filename.
	filename string

	extra_name string
}

func (self Builder) Name() string {

	name := fmt.Sprintf("%s-%s-%s-%s",
		name, version,
		self.goos,
		self.arch)

	if self.sumo {
		name += "-sumo"
	}

	if self.disable_cgo {
		name += "-nocgo"
	}

	name += self.extra_name

	if self.filename != "" {
		name = self.filename
	}

	// Windows has to have the .exe extension at the end.
	if self.goos == "windows" {
		name += ".exe"
	}

	return name
}

func (self *Builder) Env() map[string]string {
	env := make(map[string]string)

	env["GOOS"] = self.goos
	env["GOARCH"] = self.arch

	if self.disable_cgo {
		env["CGO_ENABLED"] = "0"
	} else {
		env["CGO_ENABLED"] = "1"
	}

	// Cross compile for Windows using zig cc when available.
	// The -Wno-incompatible-function-pointer-types flag is needed
	// because the WMI vtable in vql/windows/wmi/events.c triggers
	// a clang diagnostic that is treated as an error under cgo's
	// -Werror.  We pass it via CC (not CGO_CFLAGS) so that Go's
	// default -O2 -g flags are not displaced — displacing them
	// enabled UBSan instrumentation on the 386 target which broke
	// the link.
	if (runtime.GOOS == "linux" || runtime.GOOS == "darwin") &&
		self.goos == "windows" && zig_detected() {

		target := "x86_64-windows-gnu"
		if self.arch != "amd64" {
			target = "x86-windows-gnu"
		}
		env["CC"] = "zig cc -target " + target +
			" -Wno-incompatible-function-pointer-types"
	} else if (runtime.GOOS == "linux" || runtime.GOOS == "darwin") &&
		self.goos == "windows" {
		// Fall back to system mingw when zig is not installed.
		if self.arch == "amd64" {
			if mingwxcompiler_exists() {
				env["CC"] = getenv_or("MINGW_XCOMPILER", mingw_xcompiler)
			}
		} else {
			if mingwxcompiler32_exists() {
				env["CC"] = getenv_or("MINGW_XCOMPILER_32", mingw_xcompiler_32)
			}
		}
	}

	// Darwin builds need the Apple SDK.  When zig is available on
	// a Mac it locates the SDK automatically via xcrun.
	if runtime.GOOS == "darwin" && self.goos == "darwin" && zig_detected() {
		target := "x86_64-macos"
		minver := "-mmacosx-version-min=10.13"
		if self.arch == "arm64" {
			target = "aarch64-macos"
			minver = "-mmacosx-version-min=11.0"
		}
		cc := "zig cc -target " + target + " " + minver
		sdk := os.Getenv("ZIG_SDK")
		if sdk == "" {
			out, err := sh.Output("xcrun", "--show-sdk-path")
			if err == nil {
				sdk = strings.TrimSpace(out)
			}
		}
		if sdk != "" {
			cc += " -isysroot " + sdk
		}
		env["CC"] = cc
	}

	// zig cc treats -g as overriding -s when -s appears first.  The
	// Go linker emits -s before the CGO_LDFLAGS (default "-O2 -g"),
	// so with zig cc the -g wins and the final binary keeps clang's
	// DWARF debug info — making it ~15-20% larger than a gcc build
	// (which strips correctly).  Appending a trailing -s to
	// CGO_LDFLAGS makes stripping win.  gcc ignores the duplicate
	// -s, so this is safe for both compilers.
	if !self.debug_build {
		env["CGO_LDFLAGS"] = "-O2 -g -s"
	}

	if self.cc != "" {
		env["CC"] = resolve_cc(self.cc)
	}
	fmt.Printf("Build Environment: %v\n", json.MustMarshalString(env))
	return env
}

func (self Builder) Run() error {
	if err := os.Mkdir("output", 0700); err != nil && !os.IsExist(err) {
		return fmt.Errorf("failed to create output: %v", err)
	}

	err := ensure_assets()
	if err != nil {
		return err
	}

	basic_flags := "-w -s "
	if self.debug_build {
		basic_flags = ""
	}

	tags := base_tags + self.extra_tags
	if self.sumo {
		tags += " sumo "
	}

	args := []string{
		"build",
		"-o", filepath.Join("output", self.Name()),
		"-tags", tags,
		"-ldflags= " + basic_flags +
			self.extra_ldflags + flags(),
	}
	args = append(args, self.extra_flags...)
	args = append(args, "./bin/")

	return sh.RunWith(self.Env(), mg.GoCmd(), args...)
}

func Auto() error {
	return Builder{goos: runtime.GOOS,
		filename:   "velociraptor",
		extra_tags: " release yara ",
		arch:       runtime.GOARCH}.Run()
}

func AutoDev() error {
	return Builder{goos: runtime.GOOS,
		arch:        runtime.GOARCH,
		extra_tags:  " yara ",
		filename:    "velociraptor",
		extra_flags: []string{"-race"}}.Run()
}

// Build all the release versions. Darwin we build separately on a
// Mac.
func Release() error {
	err := Clean()
	if err != nil {
		return err
	}

	err = UpdateDependentTools()
	if err != nil {
		return err
	}

	err = UpdateVersionInfo()
	if err != nil {
		return err
	}

	err = build_gui_files()
	if err != nil {
		return err
	}

	if runtime.GOOS == "linux" {
		err := Linux()
		if err != nil {
			return err
		}

		if mingwxcompiler_exists() {
			err := Windows()
			if err != nil {
				return err
			}
			return Windowsx86()
		}
	}

	if runtime.GOOS == "darwin" {
		return Darwin()
	}

	return Windows()
}

func Linux() error {
	return Builder{
		extra_tags: " release yara ",
		goos:       "linux",
		arch:       "amd64"}.Run()
}

func LinuxDebug() error {
	return Builder{
		extra_tags:  " release yara ",
		goos:        "linux",
		debug_build: true,
		arch:        "amd64"}.Run()
}

func LinuxSumo() error {
	return Builder{
		extra_tags: " release yara ",
		goos:       "linux",
		sumo:       true,
		arch:       "amd64"}.Run()
}

func getMuslBuilder() Builder {
	return Builder{
		extra_tags:    " release yara ",
		goos:          "linux",
		cc:            "musl-gcc",
		extra_name:    "-musl",
		extra_ldflags: "-linkmode external -extldflags \"-static\"",
		arch:          "amd64"}
}

func LinuxMuslSumo() error {
	builer := getMuslBuilder()
	builer.sumo = true
	return builer.Run()
}

func LinuxMusl() error {
	return getMuslBuilder().Run()
}

func LinuxMuslDebug() error {
	return Builder{
		extra_tags:    " release yara ",
		goos:          "linux",
		cc:            "musl-gcc",
		extra_name:    "-musl-debug",
		debug_build:   true,
		extra_ldflags: "-linkmode external -extldflags \"-static\"",
		arch:          "amd64"}.Run()
}

func LinuxMusl386() error {
	return Builder{
		extra_tags: " release yara disable_gui ",
		goos:       "linux",
		cc:         "musl-gcc",
		extra_name: "-musl",
		//disable_cgo:   true,
		extra_ldflags: "-linkmode external -extldflags \"-static\"",
		arch:          "386"}.Run()
}

func Linux386() error {
	return Builder{
		extra_tags:  " release yara disable_gui ",
		goos:        "linux",
		disable_cgo: true,
		arch:        "386"}.Run()
}

// A Linux binary without the GUI
func LinuxBare() error {
	return Builder{
		extra_tags: " release yara disable_gui ",
		goos:       "linux",
		arch:       "amd64"}.Run()
}

func Freebsd() error {
	return Builder{
		extra_tags: " release yara ",
		goos:       "freebsd",

		// When building on actual freebsd we should have c
		// compilers, otherwise disable cgo.
		disable_cgo: runtime.GOOS != "freebsd",
		arch:        "amd64"}.Run()
}

func LinuxArmhf() error {
	return Builder{goos: "linux",
		extra_tags: " release yara ",
		cc:         "arm-linux-gnueabihf-gcc",
		arch:       "arm"}.Run()
}

func Aix() error {
	return Builder{
		extra_tags:  " release yara ",
		goos:        "aix",
		disable_cgo: true,
		arch:        "ppc64",
	}.Run()
}

func PPCLinux() error {
	return Builder{
		extra_tags:  " release yara ",
		goos:        "linux",
		disable_cgo: true,
		arch:        "ppc64le",
	}.Run()
}

func Version() error {
	fmt.Println(constants.VERSION)
	return nil
}

func LinuxArm() error {
	return Builder{
		extra_tags:  " release yara ",
		goos:        "linux",
		disable_cgo: true,
		arch:        "arm",
	}.Run()
}

func LinuxMips() error {
	return Builder{
		extra_tags:  " release yara ",
		goos:        "linux",
		disable_cgo: true,
		arch:        "mips",
	}.Run()
}

// Builds a Development binary. This does not embed things like GUI
// resources to allow them to be loaded from the local directory.
func Dev() error {
	return Builder{goos: "linux", arch: "amd64",
		extra_flags: []string{"-race"}}.Run()
}

// Cross compile the windows binary using mingw. Note that this does
// not run the race detector because the ubuntu distribution of mingw
// does not include tsan.
func Windows() error {
	return Builder{
		extra_tags: " release yara ",
		goos:       "windows",
		arch:       "amd64"}.Run()
}

func WindowsSumo() error {
	return Builder{
		extra_tags: " release yara ",
		goos:       "windows",
		sumo:       true,
		arch:       "amd64"}.Run()
}

// Windows client without a gui.
func WindowsBare() error {
	return Builder{
		extra_tags:  " release yara disable_gui ",
		goos:        "windows",
		disable_cgo: true,
		arch:        "amd64"}.Run()
}

func WindowsDev() error {
	return Builder{
		goos:       "windows",
		extra_tags: " release yara ",
		filename:   "velociraptor",
		arch:       "amd64"}.Run()
}

// Windows binary with race detection. This requires building on
// windows (ie not cross compiling). You will need to install gcc
// first using https://jmeubank.github.io/tdm-gcc/ as well as the Go
// windows distribution and optionally the windows node distribution
// (for the GUI).
func WindowsTest() error {
	return Builder{
		goos:        "windows",
		extra_tags:  " release yara ",
		filename:    "velociraptor",
		arch:        "amd64",
		extra_flags: []string{"-race"}}.Run()
}

func Windowsx86() error {
	return Builder{
		extra_tags: " release yara ",
		goos:       "windows",
		arch:       "386"}.Run()
}

func WindowsArm() error {
	return Builder{
		extra_tags:  " release yara ",
		goos:        "windows",
		disable_cgo: true,
		arch:        "arm64"}.Run()
}

func Darwin() error {
	return Builder{goos: "darwin",
		extra_tags: " release yara ",
		arch:       "amd64"}.Run()
}

func DarwinM1() error {
	return Builder{goos: "darwin",
		extra_tags: " release yara ",
		arch:       "arm64"}.Run()
}

func LinuxM1() error {
	return Builder{goos: "linux",
		extra_tags:  " release yara ",
		disable_cgo: true,
		arch:        "arm64"}.Run()
}

// To install cross compilers: apt-get install gcc-aarch64-linux-gnu
func LinuxArm64() error {
	return Builder{goos: "linux",
		extra_tags: " release yara ",
		cc:         "aarch64-linux-gnu-gcc",
		arch:       "arm64"}.Run()
}

func DarwinBase() error {
	return Builder{goos: "darwin",
		extra_tags:  " release ",
		disable_cgo: true,
		arch:        "amd64"}.Run()
}

func Clean() error {
	for _, target := range assets {
		go_target := filepath.Join(filepath.Dir(target), "ab0x.go")
		err := sh.Rm(go_target)
		if err != nil {
			return err
		}
	}

	return nil
}

// Only build the assets without building the actual code.
func Assets() error {
	err := build_gui_files()
	if err != nil {
		return err
	}

	return ensure_assets()
}

// Build only essential assets
func BasicAssets() error {
	for _, asset := range assets {
		if strings.Contains("gui", asset) {
			continue
		}

		err := fileb0x(asset)
		if err != nil {
			return err
		}
	}
	return nil
}

func build_gui_files() error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	defer os.Chdir(cwd)

	err = os.Chdir("gui/velociraptor")
	if err != nil {
		return err
	}

	err = sh.RunV("npm", "ci")
	if err != nil {
		return err
	}

	err = sh.RunV("npm", "run", "build")
	if err != nil {
		return err
	}

	// Recreate the keep files since sometimes they get removed.
	for _, keep_path := range []string{
		"build/.keep",
	} {
		os.MkdirAll(path.Dir(keep_path), 0600)

		fd, err := os.OpenFile(keep_path, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
		if err == nil {
			fd.Close()
		}
	}
	return nil
}

func flags() string {
	timestamp := time.Now().Format(time.RFC3339)
	flags := fmt.Sprintf(` -X "www.velocidex.com/golang/velociraptor/config.build_time=%s"`, timestamp)

	flags += fmt.Sprintf(` -X "www.velocidex.com/golang/velociraptor/config.commit_hash=%s"`, hash())

	// If we are running on the CI pipeline we need to know the run
	// number and URL so we can report them.
	if os.Getenv("GITHUB_SERVER_URL") != "" {
		flags += fmt.Sprintf(` -X "www.velocidex.com/golang/velociraptor/config.ci_run_url=%s"`,
			os.ExpandEnv("$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"))
	}

	return flags
}

// hash returns the git hash for the current repo or "" if none.
func hash() string {
	hash, _ := sh.Output("git", "rev-parse", "--short", "HEAD")
	return hash
}

func current_branch() string {
	branch, _ := sh.Output("git", "rev-parse", "--abbrev-ref", "HEAD")
	return branch
}

// Build the asset by linking directly to fileb0x
func fileb0x(asset string) error {
	return runner.Process(asset)
}

func ensure_assets() error {
	// Fixup the vite build - this is a hack but i cant figure vite
	// now.
	replace_string_in_file(
		index_template, `="/app/assets/index`,
		`="{{.BasePath}}/app/assets/index`)

	for _, asset := range assets {
		err := fileb0x(asset)
		if err != nil {
			return err
		}
	}

	return UpdateDependentTools()
}

// These check for the system compilers (fallback when zig is absent).
func mingwxcompiler_exists() bool {
	err := sh.Run(getenv_or("MINGW_XCOMPILER", mingw_xcompiler), "--version")
	return err == nil
}

func musl_exists() bool {
	err := sh.Run(getenv_or("MUSL_XCOMPILER", musl_xcompiler), "--version")
	return err == nil
}

func mingwxcompiler32_exists() bool {
	err := sh.Run(getenv_or("MINGW_XCOMPILER_32", mingw_xcompiler_32), "--version")
	return err == nil
}

// Temporarily manipulate the generated file until
// https://github.com/UnnoTed/fileb0x/pull/46 goes in.
func replace_string_in_file(filename string, old string, new string) error {
	read, err := ioutil.ReadFile(filename)
	if err != nil {
		return err
	}
	newContents := strings.Replace(string(read), old, new, -1)
	return ioutil.WriteFile(filename, []byte(newContents), 0644)
}

func timestamp_of(path string) int64 {
	stat, err := os.Stat(path)
	if os.IsNotExist(err) || err != nil {
		return 0
	}

	return stat.ModTime().UnixNano()
}

func UpdateDependentTools() error {
	// Do not update dependencies for dev builds as the uploaded
	// binaries do not exist yet.
	if strings.Contains(constants.VERSION, "dev") {
		return nil
	}

	v, err := semver.NewVersion(constants.CLIENT_VERSION)
	if err != nil {
		return err
	}

	template := "artifacts/definitions/Server/Internal/ToolDependencies.tmpl"
	fd, err := os.Open(template)
	if err != nil {
		return err
	}
	defer fd.Close()

	data, err := ReadAllWithLimit(fd, constants.MAX_MEMORY)
	if err != nil {
		return err
	}

	outfile := strings.ReplaceAll(template, "tmpl", "yaml")
	outfd, err := os.OpenFile(outfile,
		os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer outfd.Close()

	data = bytes.ReplaceAll(data, []byte("<VERSION>"),
		[]byte(constants.CLIENT_VERSION))
	data = bytes.ReplaceAll(data, []byte("<VERSION_BARE>"),
		[]byte(fmt.Sprintf("%d.%d", v.Major(), v.Minor())))

	_, err = outfd.Write(data)
	return err
}

func UpdateVersionInfo() error {
	read, err := ioutil.ReadFile("docs/winres/winres_template.json")
	if err != nil {
		return err
	}

	v, err := semver.NewVersion(constants.VERSION)
	if err != nil {
		return err
	}

	var prerelease int64
	prerelease_str := v.Prerelease()
	if prerelease_str != "" {
		if !strings.HasPrefix(prerelease_str, "rc") {
			return errors.New("Prerelease version should start with rc")
		}

		prerelease, err = strconv.ParseInt(prerelease_str[2:], 0, 0)
		if err != nil {
			return errors.New("Prerelease version should start with rc followed by numbers")
		}
	}

	version := fmt.Sprintf("%d.%d.%d.%d", v.Major(), v.Minor(),
		v.Patch(), prerelease)
	newContents := strings.Replace(string(read), "0.0.0.0", version, -1)
	err = ioutil.WriteFile("docs/winres/winres.json",
		[]byte(newContents), 0644)
	if err != nil {
		return err
	}

	command := []string{"make",
		"--in", "docs/winres/winres.json", "--out", "bin/rsrc"}

	err = sh.Run("go-winres", command...)
	if err != nil {
		err = sh.Run(mg.GoCmd(), "install", "github.com/tc-hib/go-winres@d743268d7ea168077ddd443c4240562d4f5e8c3e")
		if err != nil {
			return err
		}

		err = sh.Run("go-winres", command...)

		return err
	}

	return nil
}

type Package struct {
	Name  string     // declared name
	Path  string     // full import path
	Funcs []Function // list of dead functions within it
}

type Function struct {
	Name     string   // name (sans package qualifier)
	Position Position // file/line/column of function declaration
}

type Position struct {
	File      string // name of file
	Line, Col int    // line and byte index, both 1-based
}

type Ignore struct {
	IgnoreFiles     []string `yaml:"IgnoreFiles"`
	IgnoreFunctions []string `yaml:"IgnoreFunctions"`
	IgnoreMatches   []string `yaml:"IgnoreMatches"`
}

func Deadcode() error {
	fd, err := os.Open("./docs/deadcode.yaml")
	if err != nil {
		return err
	}

	data, err := ReadAllWithLimit(fd, constants.MAX_MEMORY)
	if err != nil {
		return err
	}

	ignore := &Ignore{}
	err = yaml.Unmarshal(data, ignore)
	if err != nil {
		return err
	}

	ignore_filenames := regexp.MustCompile(strings.Join(ignore.IgnoreFiles, "|"))
	ignore_functions := regexp.MustCompile(strings.Join(ignore.IgnoreFunctions, "|"))
	ignore_matches := regexp.MustCompile(strings.Join(ignore.IgnoreMatches, "|"))

	// go install golang.org/x/tools/cmd/deadcode@latest
	out, err := sh.OutputWith(map[string]string{
		"GOOS": "windows",
	}, "deadcode", "-tags", "server_vql extras", "-json", "./bin")
	if err != nil {
		return err
	}

	var packages []Package
	err = json.Unmarshal([]byte(out), &packages)
	if err != nil {
		return err
	}

	count := 0
	suppressed := 0
	for _, p := range packages {
		for _, i := range p.Funcs {
			count++
			if ignore_filenames.MatchString(i.Position.File) {
				suppressed++
				continue
			}

			if ignore_functions.MatchString(i.Name) {
				suppressed++
				continue
			}

			line := fmt.Sprintf("%v:%v (Line %v)",
				i.Position.File, i.Name, i.Position.Line)
			if ignore_matches.MatchString(line) {
				suppressed++
				continue
			}

			fmt.Println(line)
		}
	}

	fmt.Printf("deadcode reported %v functions, %v were suppressed\n",
		count, suppressed)
	return nil
}

type container struct {
	Tags []string `json:"tags"`
}

type containerMetadata struct {
	Container container `json:"container"`
}

type containerResponse struct {
	Id       uint64            `json:"id"`
	Metadata containerMetadata `json:"metadata"`
}

func InString(hay []string, needle string) bool {
	for _, x := range hay {
		if x == needle {
			return true
		}
	}

	return false
}

func doesContainerExist(name string) bool {
	fmt.Printf("checking for container with tag %v\n", name)

	var res []containerResponse
	out, err := sh.OutputWith(map[string]string{},
		"gh", "api",
		"/orgs/velocidex/packages/container/velociraptor-server/versions")
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	err = json.Unmarshal([]byte(out), &res)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return false
	}

	//fmt.Printf("Res %#v\n", json.MustMarshalString(res))
	for _, entry := range res {
		if InString(entry.Metadata.Container.Tags, name) {
			fmt.Printf("Found container: %v\n",
				json.MustMarshalString(entry))
			return true
		}
	}

	return false
}

// Build the container
func Container() error {
	tag := constants.VERSION
	fmt.Printf("Current_branch %v\n", current_branch())

	// Always update the latest master branch
	if current_branch() == "master" {
		tag = "latest"

	} else {

		// For release branches only push the first image after
		// release.
		if doesContainerExist(tag) {
			fmt.Printf("Container with tag %v already exists", tag)
			return nil
		}
	}

	builder := getMuslBuilder()

	// We really want the sumo build inside the container.
	builder.sumo = true

	target := "output/" + builder.Name()
	fmt.Printf("Getting binary from %v\n", target)

	// Copy the binary to the docker directory
	err := sh.Copy("Docker/bin/velociraptor", target)
	if err != nil {
		// If it is not there, build it.
		err := LinuxMuslSumo()
		if err != nil {
			return err
		}
		err = sh.Copy("Docker/bin/velociraptor", target)
		if err != nil {
			return err
		}
	}

	image := "ghcr.io/velocidex/velociraptor-server:" + tag

	// Build the docker image
	err = sh.Run("docker", "buildx", "build", "-t", image,
		"--label", fmt.Sprintf("version=%v", constants.VERSION),
		"--label", "commit_hash="+hash(),
		"--label", "build_time="+time.Now().Format(time.RFC3339),
		"Docker")
	if err != nil {
		return err
	}

	// Upload the image to the repository
	return sh.Run("docker", "push", image)
}
