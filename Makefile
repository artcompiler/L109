SRC = $(wildcard src/*.js)
LIB = $(SRC:src/%.js=lib/%.js)

LIB_DIR = ./lib
SRC_DIR = ./src

wdefault: lib run

lib: $(LIB)
lib/%.js: src/%.js
	mkdir -p $(@D)
	babel --modules common $< -o $@

run:
	node index
