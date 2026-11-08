@echo off
pushd "%~dp0"
if not exist "node_modules\react\package.json" goto install
if not exist "node_modules\esbuild\package.json" goto install
goto run
:install
echo Installing React dependencies. Internet access is required the first time.
call npm.cmd install
if errorlevel 1 goto failed
:run
echo Local service: http://127.0.0.1:4310
call npm.cmd start
if errorlevel 1 goto failed
popd
pause
exit /b 0
:failed
echo Setup or startup failed. Read the error above and README.md.
popd
pause
exit /b 1
