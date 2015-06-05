SRC = $(wildcard src/*.js)
LIB = $(SRC:src/%.js=lib/%.js)

LIB_DIR = ./lib
SRC_DIR = ./src

wdefault: lib run

lib: $(LIB)
lib/%.js: src/%.js
	mkdir -p $(@D)
	compile-modules convert $(SRC) > $(LIB)

run:
	node index
