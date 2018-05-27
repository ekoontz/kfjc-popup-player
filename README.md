# Introduction

My enhancements to http://kfjc.org/player. So far they are:

- 'skip backward' and 'skip forward' buttons in 10 second intervals - see screenshot below.

# Getting Started

You need a local web server to avoid security restrictions on cross-domain javascript.

## nginx

Start nginx proxy:

```
brew install nginx
nginx
```

Test with: http://localhost:8080

You should see nginx's "Welcome to nginx!" page.

You can diagnose nginx in another shell with:

```
tail -f /usr/local/var/log/nginx/*
```

## git clone

```
git clone git@github.com:ekoontz/kfjc-popup-player.git
```

## configure nginx

Edit `kfjc-popup-player/nginx.conf`: replace
`REPLACE_WITH_YOUR_HOME_DIR` with the directory where
`kfjc-popup-player` lives, (e.g. `/Users/ekoontz` for me).

Copy kfjc-configured nginx.conf to nginx directory:

```
cp kfjc-popup-player/nginx.conf /usr/local/etc/nginx
```

Restart nginx with `nginx -s reload`.


# Start browsing!

Go to: http://localhost:8080/kfjc

Now you're ready to get to work messing with the javascript and css!

