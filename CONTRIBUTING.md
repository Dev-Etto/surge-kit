# Contributing to Surge Kit

First off, thank you for considering contributing to Surge Kit! We love community involvement.

## Our Standard of Behavior

To maintain a welcoming, professional, and inclusive environment, we expect all contributors to follow a few simple rules:

* **Be Respectful:** Treat everyone with respect. Constructive criticism is welcome, but derogatory or offensive comments and any form of harassment will not be tolerated.
* **Stay on Topic:** Keep discussions focused on the project and the technical issues at hand.
* **Be Constructive:** The goal is to improve the library. If you disagree with an approach, please propose an alternative.

The project maintainer (João Neto)[https://github.com/Dev-Etto] reserves the right to moderate, edit, or reject any contributions that do not align with these standards.

## How to Contribute

### Reporting Bugs (Issues)

* Check if the issue already exists [here](https://github.com/Dev-Etto/surge-kit/issues).
* Clearly describe the bug, including steps to reproduce it, your Node.js version, and the `relay` version.

### Suggesting Enhancements

* Open an issue with the title "Feature Request: [Your Idea]".
* Describe the problem your idea solves and how it would benefit users.

### Submitting a Pull Request (PR)

1.  **Fork** the repository (`https://github.com/Dev-Etto/surge-kit/fork`).
2.  **Clone** your fork: `git clone https://github.com/YourUsername/surge-kit.git`
3.  **Create a Branch:** `git checkout -b feature/my-feature`
4.  **Make your changes** to the code, primarily within the `src/` directory.
5.  **Add Tests:** If you add a new feature, it *must* include tests. If you fix a bug, add a test that would fail without your fix. Tests are located in `src/` (e.g., `relay.test.ts`).
6.  **Run Tests and Lint:** Ensure everything is passing before submitting.
    ```bash
    # Run all tests
    npm test
    
    # Check code style
    npm run lint
    ```
    *(The `test` and `lint` scripts are defined in `package.json`)*
7.  **Commit** your changes.
8.  **Push** to your branch: `git push origin feature/my-feature`
9.  **Open a Pull Request** to the `main` branch of the `Dev-Etto/surge-kit` repository.