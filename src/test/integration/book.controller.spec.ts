import { sign } from "jsonwebtoken";
import {
  authorRepository,
  bookRepository,
  categoryRepository,
  genreRepository,
  languageRepository,
  publisherRepository,
  userRepository,
} from "../../utils/initializeRepositories";
import {
  bookAttributes,
  createUserAdminTest,
  createUserTest,
  exampleBook,
} from "../utils";
import express, { Express } from "express";
import { dataSource } from "../../configs/orm.config";
import bookRoute from "../../routes/book.route";
import request from "supertest";
import { clientRedis } from "../../utils/clientRedis";
import { Server } from "http";
import path from "path";
import fs from "fs";

describe("BookController", () => {
  let app: Express;
  let server: Server;
  const originalUrl = "/books/";

  const createAndSaveEntities = async () => {
    const lang = await languageRepository.save({
      name: bookAttributes.language,
    });
    const category = await categoryRepository.save({
      name: bookAttributes.category,
    });
    const genre = await genreRepository.save({ name: bookAttributes.genre });
    const author = await authorRepository.save({
      fullName: bookAttributes.authors,
    });
    const publisher = await publisherRepository.save({
      name: bookAttributes.publisher,
    });

    exampleBook.language = lang;
    exampleBook.category = category;
    exampleBook.genre = genre;
    exampleBook.authors = [author];
    exampleBook.publisher = publisher;

    return { lang, category, genre, author, publisher };
  };

  const cleanupDatabase = async () => {
    await userRepository.delete({});
    await bookRepository.delete({});
    await languageRepository.delete({});
    await categoryRepository.delete({});
    await genreRepository.delete({});
    await authorRepository.delete({});
    await publisherRepository.delete({});
    await clientRedis.flushdb();
  };

  beforeAll(async () => {
    await dataSource.initialize();
    app = express();
    app.use(express.json());
    app.use(originalUrl, bookRoute);
    server = app.listen(0);
  });

  beforeEach(cleanupDatabase);

  afterAll(async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await dataSource.destroy();
      await clientRedis.quit();
      clientRedis.disconnect();
    } catch (error) {
      console.log(error);
    }
  });

  describe("GET / - Get books on the main page", () => {
    it("should return books for the main page when user is authenticated", async () => {
      const user = await userRepository.save(createUserTest);
      await createAndSaveEntities();
      exampleBook.user = user;
      await bookRepository.save(exampleBook);

      const jwt = sign(
        createUserTest,
        process.env.SECRET_PHRASE_ACCESS_TOKEN as string
      );
      const response = await request(server)
        .get(originalUrl)
        .set("Authorization", `Bearer ${jwt}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("newBooks");
      expect(await clientRedis.get(originalUrl)).toBeNull();
    });

    it("should return books for the main page when user is not authenticated", async () => {
      const response = await request(server).get(originalUrl);
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("newBooks");

      const cachedBooks = await clientRedis.get(originalUrl);
      expect(cachedBooks).toBeTruthy();

      const normalizeBook = (book: any) => {
        const { id, createdAt, updateAt, ...rest } = book;
        return rest;
      };
      const booksFromCache = JSON.parse(cachedBooks as string);

      ["newBooks", "salesBooks", "bestsellerBooks"].forEach((key) => {
        expect(booksFromCache[key].map(normalizeBook)).toEqual(
          response.body[key].map(normalizeBook)
        );
      });
    });
  });

  describe("POST / - create book", () => {
    const setupBookCreation = async () => {
      const { lang, category, genre, author, publisher } =
        await createAndSaveEntities();
      const user = await userRepository.save(createUserAdminTest);
      const jwt = sign({ id: user.id }, process.env.SECRET_PHRASE_ACCESS_TOKEN);
      const testImagePath = path.join(__dirname, "test-image.png");
      fs.writeFileSync(testImagePath, "Test image content");

      return { lang, category, genre, author, publisher, jwt, testImagePath };
    };

    it("should create and return a new book", async () => {
      const { lang, category, genre, author, publisher, jwt, testImagePath } =
        await setupBookCreation();
      const newBookPayload = {
        ...exampleBook,
        language: lang.id,
        category: category.id,
        genre: genre.id,
        authors: [author.id],
        publisher: publisher.id,
      };

      const response = await request(server)
        .post("/books/create")
        .set("Authorization", `Bearer ${jwt}`)
        .field("title", newBookPayload.title)
        .field("pagesQuantity", newBookPayload.pagesQuantity)
        .field("summary", newBookPayload.summary)
        .field("coverImageLink", newBookPayload.coverImageLink)
        .field("originalPrice", newBookPayload.originalPrice)
        .field("discountedPrice", newBookPayload.discountedPrice)
        .field("language", newBookPayload.language)
        .field("isbn", newBookPayload.isbn)
        .field("category", newBookPayload.category)
        .field("publicationYear", newBookPayload.publicationYear)
        .field("publisher", newBookPayload.publisher)
        .field("authors", newBookPayload.authors)
        .field("availableBooks", newBookPayload.availableBooks)
        .field("genre", newBookPayload.genre)
        .attach("image", testImagePath);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("title");
    });

    it("should return an error if the book title already exists", async () => {
      const { lang, category, genre, author, publisher, jwt, testImagePath } =
        await setupBookCreation();
      const newBookPayload = {
        ...exampleBook,
        language: lang.id,
        category: category.id,
        genre: genre.id,
        authors: [author.id],
        publisher: publisher.id,
      };

      await request(server)
        .post("/books/create")
        .set("Authorization", `Bearer ${jwt}`)
        .field("title", newBookPayload.title)
        .field("pagesQuantity", newBookPayload.pagesQuantity)
        .field("summary", newBookPayload.summary)
        .field("coverImageLink", newBookPayload.coverImageLink)
        .field("originalPrice", newBookPayload.originalPrice)
        .field("discountedPrice", newBookPayload.discountedPrice)
        .field("language", newBookPayload.language)
        .field("isbn", newBookPayload.isbn)
        .field("category", newBookPayload.category)
        .field("publicationYear", newBookPayload.publicationYear)
        .field("publisher", newBookPayload.publisher)
        .field("authors", newBookPayload.authors)
        .field("availableBooks", newBookPayload.availableBooks)
        .field("genre", newBookPayload.genre)
        .attach("image", testImagePath);

      const response = await request(server)
        .post("/books/create")
        .set("Authorization", `Bearer ${jwt}`)
        .field("title", newBookPayload.title)
        .field("pagesQuantity", newBookPayload.pagesQuantity)
        .field("summary", newBookPayload.summary)
        .field("coverImageLink", newBookPayload.coverImageLink)
        .field("originalPrice", newBookPayload.originalPrice)
        .field("discountedPrice", newBookPayload.discountedPrice)
        .field("language", newBookPayload.language)
        .field("isbn", newBookPayload.isbn)
        .field("category", newBookPayload.category)
        .field("publicationYear", newBookPayload.publicationYear)
        .field("publisher", newBookPayload.publisher)
        .field("authors", newBookPayload.authors)
        .field("availableBooks", newBookPayload.availableBooks)
        .field("genre", newBookPayload.genre)
        .attach("image", testImagePath);

      expect(response.status).toBe(400);
    });
  });
});
